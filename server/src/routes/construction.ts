import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { parseJson, toJson } from '../lib/json';
import { getSettings } from '../lib/settings';
import { notify } from '../lib/notify';
import { CAPABILITIES, ROLES } from '../lib/enums';
import { assertCaseAccess, caseScope, requireCapability } from '../middleware/auth';
import { addDays } from '../workflow/engine';

export const constructionRouter = Router();

// ---------------------------------------------------------------------------
// Portfolio view: every case that has reached the development phase
// ---------------------------------------------------------------------------

constructionRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 25);
    const and: any[] = [{ deletedAt: null }, caseScope(req), { phase: 'D' }];
    if (req.query.atRisk === 'true') {
      and.push({ compliance: { status: { in: ['AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD'] } } });
    }
    const where = { AND: and };

    const [items, total] = await Promise.all([
      prisma.case.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          applicant: { select: { name: true } },
          plot: { select: { code: true, themeCity: true } },
          compliance: true,
          permission: true,
          milestones: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      prisma.case.count({ where }),
    ]);

    res.json(
      paged(
        items.map((c) => ({
          ...c,
          permission: c.permission ? { ...c.permission, nocs: parseJson<any[]>(c.permission.nocs, []) } : null,
          progressPct: averageProgress(c.milestones),
        })),
        total,
        page,
        pageSize
      )
    );
  })
);

function averageProgress(milestones: { plannedPct: number; actualPct: number }[]) {
  if (!milestones.length) return 0;
  return Math.round(milestones.reduce((s, m) => s + m.actualPct, 0) / milestones.length);
}

// ---------------------------------------------------------------------------
// Building permission
// ---------------------------------------------------------------------------

constructionRouter.get(
  '/permission/:caseId',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.caseId);
    const settings = await getSettings();
    const row = await prisma.buildingPermission.findUnique({ where: { caseId: req.params.caseId } });
    res.json({
      permission: row ? { ...row, nocs: parseJson<any[]>(row.nocs, []) } : null,
      nocTypes: settings.master_noc_types ?? null,
    });
  })
);

const permissionSchema = z.object({
  applicationNo: z.string().optional(),
  proposedFsi: z.coerce.number().min(0).optional(),
  proposedFar: z.coerce.number().min(0).optional(),
  builtUpArea: z.coerce.number().min(0).optional(),
  layoutApproved: z.boolean().optional(),
  status: z.enum(['NOT_STARTED', 'SUBMITTED', 'UNDER_SCRUTINY', 'SANCTIONED', 'REJECTED']).optional(),
  remarks: z.string().optional(),
  nocs: z
    .array(
      z.object({
        type: z.string().min(1),
        status: z.enum(['PENDING', 'CLEARED', 'REJECTED', 'NOT_APPLICABLE']),
        ref: z.string().optional().default(''),
        date: z.string().optional().nullable(),
      })
    )
    .optional(),
});

constructionRouter.put(
  '/permission/:caseId',
  requireCapability(CAPABILITIES.CONSTRUCTION_MANAGE),
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.caseId);
    const body = permissionSchema.parse(req.body);
    const data: any = { ...body };
    if (body.nocs) data.nocs = toJson(body.nocs);
    if (body.status === 'SANCTIONED') data.sanctionedAt = new Date();

    const row = await prisma.buildingPermission.upsert({
      where: { caseId: req.params.caseId },
      create: { caseId: req.params.caseId, ...data },
      update: data,
    });
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: req.params.caseId }, select: { code: true } });
    await audit(req, {
      action: 'BUILDING_PERMISSION_UPDATED',
      entity: 'BuildingPermission',
      entityId: row.id,
      caseCode: caseRow.code,
      summary: `Building permission → ${row.status}`,
      after: { status: row.status, fsi: row.proposedFsi },
    });
    res.json({ ...row, nocs: parseJson<any[]>(row.nocs, []) });
  })
);

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

constructionRouter.get(
  '/milestones/:caseId',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.caseId);
    const rows = await prisma.constructionMilestone.findMany({
      where: { caseId: req.params.caseId },
      orderBy: [{ sortOrder: 'asc' }, { plannedDate: 'asc' }],
    });
    res.json(rows);
  })
);

const milestoneSchema = z.object({
  caseId: z.string().min(1),
  title: z.string().min(2),
  plannedDate: z.string(),
  plannedPct: z.coerce.number().min(0).max(100).default(0),
  sortOrder: z.coerce.number().int().default(0),
  note: z.string().optional().default(''),
});

constructionRouter.post(
  '/milestones',
  requireCapability(CAPABILITIES.CONSTRUCTION_MANAGE),
  asyncHandler(async (req, res) => {
    const body = milestoneSchema.parse(req.body);
    await assertCaseAccess(req, body.caseId);
    const row = await prisma.constructionMilestone.create({
      data: { ...body, plannedDate: new Date(body.plannedDate) },
    });
    await audit(req, {
      action: 'MILESTONE_CREATED',
      entity: 'ConstructionMilestone',
      entityId: row.id,
      summary: `Milestone "${row.title}" planned for ${row.plannedDate.toDateString()}`,
    });
    res.status(201).json(row);
  })
);

/** Investors update progress; officers can also correct it. */
constructionRouter.patch(
  '/milestones/:id',
  requireCapability(CAPABILITIES.CONSTRUCTION_UPDATE, CAPABILITIES.CONSTRUCTION_MANAGE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        actualPct: z.coerce.number().min(0).max(100).optional(),
        actualDate: z.string().nullable().optional(),
        status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']).optional(),
        note: z.string().optional(),
        title: z.string().optional(),
        plannedDate: z.string().optional(),
        plannedPct: z.coerce.number().min(0).max(100).optional(),
      })
      .parse(req.body);

    const before = await prisma.constructionMilestone.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Milestone not found.');
    await assertCaseAccess(req, before.caseId);

    const after = await prisma.constructionMilestone.update({
      where: { id: req.params.id },
      data: {
        ...body,
        actualDate: body.actualDate === undefined ? undefined : body.actualDate ? new Date(body.actualDate) : null,
        plannedDate: body.plannedDate ? new Date(body.plannedDate) : undefined,
      },
    });

    await audit(req, {
      action: 'MILESTONE_UPDATED',
      entity: 'ConstructionMilestone',
      entityId: after.id,
      summary: `"${after.title}" → ${after.actualPct}% (${after.status})`,
      before: { actualPct: before.actualPct, status: before.status },
      after: { actualPct: after.actualPct, status: after.status },
    });
    res.json(after);
  })
);

// ---------------------------------------------------------------------------
// Compliance & the lapse / resumption trigger
// ---------------------------------------------------------------------------

constructionRouter.get(
  '/compliance/:caseId',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.caseId);
    const row = await prisma.complianceRecord.findUnique({ where: { caseId: req.params.caseId } });
    res.json(row);
  })
);

constructionRouter.put(
  '/compliance/:caseId',
  requireCapability(CAPABILITIES.CONSTRUCTION_MANAGE),
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.caseId);
    const body = z
      .object({
        commencementDeadline: z.string().nullable().optional(),
        commencedAt: z.string().nullable().optional(),
        status: z
          .enum(['PENDING', 'GOOD_STANDING', 'AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD', 'RESUMED', 'COMPLETED'])
          .optional(),
        note: z.string().optional(),
        utilisationCertUrl: z.string().nullable().optional(),
        completionCertUrl: z.string().nullable().optional(),
      })
      .parse(req.body);

    const data: any = { ...body };
    for (const key of ['commencementDeadline', 'commencedAt'] as const) {
      if (body[key] !== undefined) data[key] = body[key] ? new Date(body[key]!) : null;
    }

    const row = await prisma.complianceRecord.upsert({
      where: { caseId: req.params.caseId },
      create: { caseId: req.params.caseId, ...data },
      update: data,
    });
    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: req.params.caseId }, select: { code: true } });
    await audit(req, {
      action: 'COMPLIANCE_UPDATED',
      entity: 'ComplianceRecord',
      entityId: row.id,
      caseCode: caseRow.code,
      summary: `Compliance → ${row.status}`,
      after: { status: row.status },
    });
    res.json(row);
  })
);

/** Issues the show-cause notice and opens the configured cure period. */
constructionRouter.post(
  '/compliance/:caseId/notice',
  requireCapability(CAPABILITIES.CONSTRUCTION_MANAGE),
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.caseId);
    const { note } = z.object({ note: z.string().min(10) }).parse(req.body);
    const settings = await getSettings();
    const cureDays = Number(settings.cure_period_days ?? 90);

    const row = await prisma.complianceRecord.upsert({
      where: { caseId: req.params.caseId },
      create: {
        caseId: req.params.caseId,
        status: 'BREACH_NOTICE',
        noticeIssuedAt: new Date(),
        cureDeadline: addDays(new Date(), cureDays),
        note,
      },
      update: {
        status: 'BREACH_NOTICE',
        noticeIssuedAt: new Date(),
        cureDeadline: addDays(new Date(), cureDays),
        note,
      },
    });

    const caseRow = await prisma.case.findUniqueOrThrow({
      where: { id: req.params.caseId },
      select: { code: true, applicant: { select: { contactUserId: true } } },
    });
    await audit(req, {
      action: 'BREACH_NOTICE_ISSUED',
      entity: 'ComplianceRecord',
      entityId: row.id,
      caseCode: caseRow.code,
      summary: `Show-cause notice issued; ${cureDays}-day cure period to ${row.cureDeadline?.toDateString()}`,
    });
    await notify({
      userIds: caseRow.applicant.contactUserId ? [caseRow.applicant.contactUserId] : [],
      roleKeys: [ROLES.LANDS_OFFICER],
      type: 'BREACH_NOTICE',
      title: `${caseRow.code} — show-cause notice issued`,
      message: `${note} Cure period ends ${row.cureDeadline?.toDateString()}.`,
      caseId: req.params.caseId,
      link: `/cases/${req.params.caseId}`,
    });

    res.json(row);
  })
);
