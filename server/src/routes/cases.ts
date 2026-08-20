import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, conflict, forbidden, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { diff, parseJson, toJson } from '../lib/json';
import { getSettings } from '../lib/settings';
import { CAPABILITIES, CASE_STATUS, ROLES, STAGE_INSTANCE_STATUS, TERMINAL_STATUSES } from '../lib/enums';
import { assertCaseAccess, caseScope, isInvestor, requireCapability } from '../middleware/auth';
import {
  applyDecision,
  assertCanAct,
  isStageApplicable,
  loadStages,
  parseStage,
  startCaseWorkflow,
} from '../workflow/engine';

export const casesRouter = Router();

const caseInclude = {
  applicant: true,
  plot: true,
  assignee: { select: { id: true, name: true, roleKey: true } },
};

// ---------------------------------------------------------------------------
// List & search
// ---------------------------------------------------------------------------

casesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query);
    const q = String(req.query.q ?? '').trim();

    const and: any[] = [{ deletedAt: null }, caseScope(req)];

    if (q) {
      and.push({
        OR: [
          { code: { contains: q } },
          { title: { contains: q } },
          { sector: { contains: q } },
          { applicant: { name: { contains: q } } },
          { plot: { code: { contains: q } } },
        ],
      });
    }

    const eq = (key: string, param: string) => {
      const v = req.query[param];
      if (v && v !== 'ALL') and.push({ [key]: String(v) });
    };
    eq('currentStageId', 'stageId');
    eq('phase', 'phase');
    eq('status', 'status');
    eq('mode', 'mode');
    eq('objectiveCategory', 'objectiveCategory');
    eq('sector', 'sector');
    eq('holdingType', 'holdingType');
    eq('assigneeId', 'assigneeId');
    eq('plotId', 'plotId');

    if (req.query.from) and.push({ createdAt: { gte: new Date(String(req.query.from)) } });
    if (req.query.to) and.push({ createdAt: { lte: new Date(String(req.query.to)) } });
    if (req.query.overdue === 'true') {
      and.push({ slaDueAt: { lt: new Date() }, status: { notIn: TERMINAL_STATUSES } });
    }
    if (req.query.active === 'true') and.push({ status: { notIn: TERMINAL_STATUSES } });

    const where = { AND: and };
    const orderBy = sortFor(String(req.query.sort ?? 'updatedAt:desc'));

    const [rows, total] = await Promise.all([
      prisma.case.findMany({ where, include: caseInclude, orderBy, skip, take }),
      prisma.case.count({ where }),
    ]);

    const stages = await loadStages();
    res.json(paged(rows.map((r) => decorate(r, stages)), total, page, pageSize));
  })
);

function sortFor(sort: string) {
  const [field, dir] = sort.split(':');
  const allowed = ['updatedAt', 'createdAt', 'code', 'slaDueAt', 'investmentAmount', 'extentAcres'];
  const key = allowed.includes(field) ? field : 'updatedAt';
  return { [key]: dir === 'asc' ? 'asc' : 'desc' } as any;
}

function decorate(row: any, stages: { id: string; code: string; name: string; phase: string }[]) {
  const stage = stages.find((s) => s.id === row.currentStageId);
  const terminal = TERMINAL_STATUSES.includes(row.status);
  return {
    ...row,
    currentStage: stage ? { id: stage.id, code: stage.code, name: stage.name, phase: stage.phase } : null,
    isOverdue: !terminal && !!row.slaDueAt && row.slaDueAt < new Date(),
    ageDays: Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 86_400_000),
  };
}

// ---------------------------------------------------------------------------
// Create (an investor application, or an officer-entered case)
// ---------------------------------------------------------------------------

const createSchema = z.object({
  applicantId: z.string().optional(),
  applicant: z
    .object({
      entityType: z.string().min(1),
      name: z.string().min(2),
      promoterProfile: z.string().optional().default(''),
      netWorth: z.coerce.number().min(0).default(0),
      pan: z.string().optional().default(''),
      cin: z.string().optional().default(''),
      contactEmail: z.string().email().optional().or(z.literal('')),
      contactPhone: z.string().optional().default(''),
      address: z.string().optional().default(''),
      contactUserId: z.string().nullable().optional(),
    })
    .optional(),
  title: z.string().min(3),
  plotId: z.string().optional().nullable(),
  mode: z.string().default('NOMINATION'),
  objectiveCategory: z.string().default('ECONOMIC_DEVELOPMENT'),
  sector: z.string().default(''),
  investmentAmount: z.coerce.number().min(0).default(0),
  jobsCommitted: z.coerce.number().int().min(0).default(0),
  extentAcres: z.coerce.number().min(0).default(0),
  holdingType: z.string().default('LEASEHOLD'),
  isConcessional: z.boolean().default(false),
  invitationRef: z.string().optional().default(''),
});

casesRouter.post(
  '/',
  requireCapability(CAPABILITIES.CASES_CREATE),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    let applicantId = body.applicantId;
    if (isInvestor(req)) {
      // Investors always file under one of their own applicant profiles.
      if (applicantId && !req.user!.applicantIds.includes(applicantId)) {
        throw forbidden('You can only apply under your own applicant profile.');
      }
      applicantId = applicantId ?? req.user!.applicantIds[0];
    }

    if (!applicantId) {
      if (!body.applicant) throw badRequest('Provide either an existing applicantId or a new applicant record.');
      const created = await prisma.applicant.create({
        data: {
          ...body.applicant,
          contactEmail: body.applicant.contactEmail || req.user!.email,
          // Officers may nominate the investor login that will act on this case.
          contactUserId: isInvestor(req) ? req.user!.id : body.applicant.contactUserId ?? null,
        },
      });
      applicantId = created.id;
    }

    const plot = body.plotId ? await prisma.plot.findUnique({ where: { id: body.plotId } }) : null;
    if (body.plotId && !plot) throw notFound('Selected plot does not exist.');
    if (plot && plot.availability !== 'AVAILABLE' && plot.availability !== 'RESERVED') {
      throw conflict(`Plot ${plot.code} is ${plot.availability.toLowerCase()} and cannot be applied for.`);
    }

    const code = await nextCaseCode();
    const created = await prisma.case.create({
      data: {
        code,
        title: body.title,
        applicantId,
        plotId: plot?.id ?? null,
        mode: body.mode,
        objectiveCategory: body.objectiveCategory,
        sector: body.sector,
        investmentAmount: body.investmentAmount,
        jobsCommitted: body.jobsCommitted,
        extentAcres: body.extentAcres || plot?.extentAcres || 0,
        holdingType: body.holdingType,
        isConcessional: body.isConcessional,
        landCategory: plot?.landCategory ?? 'NORMAL',
        status: CASE_STATUS.DRAFT,
      },
      include: caseInclude,
    });

    if (plot) {
      await prisma.plot.update({ where: { id: plot.id }, data: { availability: 'RESERVED' } });
    }

    await startCaseWorkflow(created, body.invitationRef);

    await audit(req, {
      action: 'CASE_CREATED',
      entity: 'Case',
      entityId: created.id,
      caseCode: created.code,
      summary: `Case created for ${created.applicant.name}`,
      after: { code: created.code, title: created.title, plot: plot?.code ?? null },
    });

    const stages = await loadStages();
    const fresh = await prisma.case.findUniqueOrThrow({ where: { id: created.id }, include: caseInclude });
    res.status(201).json(decorate(fresh, stages));
  })
);

async function nextCaseCode() {
  const year = new Date().getFullYear();
  const prefix = `APCRDA/LA/${year}/`;
  const last = await prisma.case.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const seq = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

casesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.case.findFirst({
      where: { id: req.params.id, deletedAt: null, ...caseScope(req) },
      include: {
        ...caseInclude,
        stageInstances: {
          orderBy: [{ startedAt: 'asc' }],
          include: {
            stage: true,
            decisions: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } },
          },
        },
        compliance: true,
        permission: true,
        _count: { select: { documents: true, payments: true, grievances: true, cancellations: true } },
      },
    });
    if (!row) throw notFound('Case not found or not visible to your role.');

    const stages = await loadStages();
    const settings = await getSettings();

    const active = row.stageInstances.find((si) => si.status === STAGE_INSTANCE_STATUS.ACTIVE) ?? null;
    const activeStage = active ? stages.find((s) => s.id === active.stageId) ?? null : null;

    // Permission for the *current* user on the active stage drives the UI's buttons.
    let canAct = false;
    if (activeStage && !TERMINAL_STATUSES.includes(row.status)) {
      if (req.user!.roleKey === ROLES.SUPER_ADMIN) canAct = true;
      else if (req.user!.roleKey !== ROLES.VIEWER) {
        const perm = await prisma.permission.findUnique({
          where: { roleKey_stageId: { roleKey: req.user!.roleKey, stageId: activeStage.id } },
        });
        canAct = !!perm?.canAct;
        if (canAct && isInvestor(req)) canAct = req.user!.applicantIds.includes(row.applicantId);
      }
    }

    const timeline = stages.map((stage) => {
      const instances = row.stageInstances
        .filter((si) => si.stageId === stage.id)
        .map((si) => ({
          id: si.id,
          round: si.round,
          roundLabel: si.roundLabel,
          status: si.status,
          startedAt: si.startedAt,
          completedAt: si.completedAt,
          dueAt: si.dueAt,
          data: parseJson<Record<string, any>>(si.data, {}),
          decisions: si.decisions.map((d) => ({
            id: d.id,
            outcome: d.outcome,
            outcomeLabel: d.outcomeLabel,
            kind: d.kind,
            remarks: d.remarks,
            actorName: d.actor?.name ?? d.actorName,
            actorRole: d.actorRole,
            createdAt: d.createdAt,
          })),
        }));

      const applicable = isStageApplicable(stage, row, settings);
      let state: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'SKIPPED' | 'BLOCKED' = 'UPCOMING';
      if (instances.some((i) => i.status === STAGE_INSTANCE_STATUS.ACTIVE)) state = 'CURRENT';
      else if (instances.some((i) => i.status === STAGE_INSTANCE_STATUS.REJECTED)) state = 'BLOCKED';
      else if (instances.length) state = 'COMPLETED';
      else if (!applicable) state = 'SKIPPED';

      return {
        stage: {
          id: stage.id,
          code: stage.code,
          name: stage.name,
          order: stage.order,
          phase: stage.phase,
          type: stage.type,
          ownerRoleKey: stage.ownerRoleKey,
          coOwnerRole: stage.coOwnerRole,
          slaDays: stage.slaDays,
          maxRounds: stage.maxRounds,
          roundLabels: stage.roundLabels,
          optional: stage.optional,
          enabled: stage.enabled,
          description: stage.description,
        },
        applicable,
        state,
        instances,
      };
    });

    res.json({
      ...decorate(row, stages),
      timeline,
      activeStageInstance: active
        ? {
            id: active.id,
            round: active.round,
            roundLabel: active.roundLabel,
            dueAt: active.dueAt,
            startedAt: active.startedAt,
            data: parseJson<Record<string, any>>(active.data, {}),
            stage: activeStage,
          }
        : null,
      canAct,
      nextActor: activeStage
        ? { roleKey: activeStage.ownerRoleKey, coOwnerRole: activeStage.coOwnerRole }
        : null,
      counts: row._count,
    });
  })
);

// ---------------------------------------------------------------------------
// Update case header
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  title: z.string().min(3).optional(),
  sector: z.string().optional(),
  objectiveCategory: z.string().optional(),
  mode: z.string().optional(),
  holdingType: z.string().optional(),
  isConcessional: z.boolean().optional(),
  landCategory: z.string().optional(),
  extentAcres: z.coerce.number().min(0).optional(),
  investmentAmount: z.coerce.number().min(0).optional(),
  jobsCommitted: z.coerce.number().int().min(0).optional(),
  plotId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

casesRouter.patch(
  '/:id',
  requireCapability(CAPABILITIES.CASES_ASSIGN, CAPABILITIES.CASES_CREATE),
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.id);
    const body = updateSchema.parse(req.body);
    const before = await prisma.case.findUniqueOrThrow({ where: { id: req.params.id } });

    if (isInvestor(req) && before.status !== CASE_STATUS.DRAFT && before.phase !== 'A') {
      throw forbidden('The application header can no longer be edited once the case has left intake.');
    }

    const after = await prisma.case.update({
      where: { id: req.params.id },
      data: body,
      include: caseInclude,
    });

    const d = diff(before as any, after as any);
    await audit(req, {
      action: 'CASE_UPDATED',
      entity: 'Case',
      entityId: after.id,
      caseCode: after.code,
      summary: `Updated: ${Object.keys(d.after).join(', ') || 'no change'}`,
      before: d.before,
      after: d.after,
    });

    const stages = await loadStages();
    res.json(decorate(after, stages));
  })
);

/** Soft delete only — cases are never removed from the record. */
casesRouter.delete(
  '/:id',
  requireCapability(CAPABILITIES.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    const row = await prisma.case.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    await audit(req, {
      action: 'CASE_ARCHIVED',
      entity: 'Case',
      entityId: row.id,
      caseCode: row.code,
      summary: 'Case soft-deleted (archived); history retained.',
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Stage data + gate actions
// ---------------------------------------------------------------------------

/** Saves the active stage's form without taking a gate decision. */
casesRouter.patch(
  '/:id/stage-instances/:instanceId',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.id);
    const data = z.record(z.any()).parse(req.body?.data ?? {});

    const instance = await prisma.stageInstance.findUnique({
      where: { id: req.params.instanceId },
      include: { stage: true },
    });
    if (!instance || instance.caseId !== req.params.id) throw notFound('Stage instance not found.');
    if (instance.status !== STAGE_INSTANCE_STATUS.ACTIVE) throw conflict('This stage is no longer active.');

    const stage = parseStage(instance.stage);
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: req.params.id } });

    // Saving draft data needs the same act permission as the gate itself.
    await assertCanAct(req, stage, caseRow);

    const merged = { ...parseJson<Record<string, any>>(instance.data, {}), ...data };
    const updated = await prisma.stageInstance.update({
      where: { id: instance.id },
      data: { data: toJson(merged) },
    });

    await audit(req, {
      action: 'STAGE_DATA_SAVED',
      entity: 'StageInstance',
      entityId: instance.id,
      caseCode: caseRow.code,
      summary: `Stage ${stage.code} draft data saved`,
      after: data,
    });

    res.json({ id: updated.id, data: merged });
  })
);

const decisionSchema = z.object({
  outcome: z.string().min(1),
  remarks: z.string().min(5, 'Remarks are required on every gate action.'),
  data: z.record(z.any()).optional(),
});

casesRouter.post(
  '/:id/stage-instances/:instanceId/decision',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.id);
    const body = decisionSchema.parse(req.body);

    const result = await applyDecision({
      req,
      caseId: req.params.id,
      stageInstanceId: req.params.instanceId,
      outcome: body.outcome,
      remarks: body.remarks,
      data: body.data,
    });

    const stages = await loadStages();
    res.json({
      case: decorate(result.case, stages),
      decision: result.decision,
      movedTo: result.result,
    });
  })
);

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

casesRouter.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.id);
    const where: any = { caseId: req.params.id };
    if (isInvestor(req)) where.visibility = 'INVESTOR';

    const rows = await prisma.caseComment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { name: true, roleKey: true } } },
    });
    res.json(rows);
  })
);

casesRouter.post(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.id);
    const { body, visibility } = z
      .object({ body: z.string().min(1), visibility: z.enum(['INTERNAL', 'INVESTOR']).default('INTERNAL') })
      .parse(req.body);

    // An investor's note is always visible to the investor.
    const finalVisibility = isInvestor(req) ? 'INVESTOR' : visibility;

    const row = await prisma.caseComment.create({
      data: { caseId: req.params.id, authorId: req.user!.id, body, visibility: finalVisibility },
      include: { author: { select: { name: true, roleKey: true } } },
    });
    await audit(req, {
      action: 'COMMENT_ADDED',
      entity: 'Case',
      entityId: req.params.id,
      summary: `${finalVisibility.toLowerCase()} note added`,
    });
    res.status(201).json(row);
  })
);

// ---------------------------------------------------------------------------
// Per-case audit trail
// ---------------------------------------------------------------------------

casesRouter.get(
  '/:id/audit',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.id);
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: req.params.id }, select: { code: true } });
    const rows = await prisma.auditLog.findMany({
      where: { OR: [{ entityId: req.params.id }, { caseCode: caseRow.code }] },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    res.json(
      rows.map((r) => ({
        ...r,
        before: parseJson<any>(r.before, null),
        after: parseJson<any>(r.after, null),
      }))
    );
  })
);
