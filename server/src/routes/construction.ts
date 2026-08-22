import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { parseJson, toJson } from '../lib/json';
import { getSettings } from '../lib/settings';
import { notify } from '../lib/notify';
import {
  CAPABILITIES,
  DOCUMENT_REVIEW_STATUSES,
  PERMIT_DOCUMENT_TYPES,
  PERMIT_PAYMENT_TYPES,
  PERMIT_STATUSES,
  ROLES,
} from '../lib/enums';
import { assertCaseAccess, caseScope, isInvestor, requireCapability } from '../middleware/auth';
import { addDays } from '../workflow/engine';

export const constructionRouter = Router();

// ---------------------------------------------------------------------------
// Portfolio view: every case whose building permit is in play
// ---------------------------------------------------------------------------

const PERMIT_DOC_TYPES = PERMIT_DOCUMENT_TYPES.map((d) => d.type);
const REQUIRED_DOC_TYPES = PERMIT_DOCUMENT_TYPES.filter((d) => d.required).map((d) => d.type);

constructionRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 25);
    const and: any[] = [{ deletedAt: null }, caseScope(req), { phase: 'D' }];
    if (req.query.atRisk === 'true') {
      and.push({ compliance: { status: { in: ['AT_RISK', 'BREACH_NOTICE', 'CURE_PERIOD'] } } });
    }
    if (req.query.status && req.query.status !== 'ALL') {
      const status = String(req.query.status);
      // "Not started" also covers a case that has no permission row at all yet.
      and.push(status === 'NOT_STARTED' ? { OR: [{ permission: { status } }, { permission: null }] } : { permission: { status } });
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
          plot: { select: { code: true, themeCity: true, landUse: true } },
          compliance: true,
          permission: true,
          milestones: { orderBy: { sortOrder: 'asc' } },
          documents: {
            // An investor sees only what has been shared with them, exactly as /documents does.
            where: { type: { in: PERMIT_DOC_TYPES }, ...(isInvestor(req) ? { visibility: 'INVESTOR' } : {}) },
            orderBy: [{ uploadedAt: 'desc' }],
            select: {
              id: true,
              type: true,
              name: true,
              version: true,
              size: true,
              mimeType: true,
              uploadedAt: true,
              uploadedBy: { select: { name: true } },
              reviewStatus: true,
              reviewedAt: true,
              reviewedByName: true,
              reviewNote: true,
            },
          },
          payments: {
            where: { type: { in: PERMIT_PAYMENT_TYPES } },
            orderBy: [{ dueDate: 'asc' }],
            select: {
              id: true,
              type: true,
              label: true,
              amount: true,
              penalty: true,
              status: true,
              dueDate: true,
              paidDate: true,
              reference: true,
            },
          },
        },
      }),
      prisma.case.count({ where }),
    ]);

    res.json({
      ...paged(items.map(shapePermitCase), total, page, pageSize),
      docTypes: PERMIT_DOCUMENT_TYPES,
      feeTypes: PERMIT_PAYMENT_TYPES,
      statuses: PERMIT_STATUSES,
    });
  })
);

/** One case as the permits desk needs it: permit, its papers, and its money. */
function shapePermitCase(c: any) {
  const nocs = c.permission ? parseJson<any[]>(c.permission.nocs, []) : [];
  // Documents come back newest-first, so the first of a type is the live version.
  const latest = new Map<string, any>();
  for (const d of c.documents) if (!latest.has(d.type)) latest.set(d.type, d);
  const supplied = new Set<string>(latest.keys());
  const live = [...latest.values()];
  const fees = c.payments as { amount: number; penalty: number; status: string; dueDate: Date | null }[];
  const now = new Date();

  return {
    ...c,
    permission: c.permission ? { ...c.permission, nocs } : null,
    progressPct: averageProgress(c.milestones),
    nocSummary: {
      cleared: nocs.filter((n) => n.status === 'CLEARED').length,
      pending: nocs.filter((n) => n.status === 'PENDING').length,
      rejected: nocs.filter((n) => n.status === 'REJECTED').length,
    },
    docSummary: {
      supplied: REQUIRED_DOC_TYPES.filter((t) => supplied.has(t)).length,
      required: REQUIRED_DOC_TYPES.length,
      missing: REQUIRED_DOC_TYPES.filter((t) => !supplied.has(t)),
      // Scrutiny of the live version of each type — an older version that was
      // approved does not count once a replacement has been filed.
      approved: live.filter((d) => d.reviewStatus === 'APPROVED').length,
      awaitingReview: live.filter((d) => d.reviewStatus === 'PENDING').length,
      rejected: live.filter((d) => d.reviewStatus === 'REJECTED').length,
    },
    feeSummary: {
      billed: fees.reduce((s, p) => s + p.amount + p.penalty, 0),
      collected: fees.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0),
      outstanding: fees
        .filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE')
        .reduce((s, p) => s + p.amount + p.penalty, 0),
      overdue: fees.filter((p) => p.status !== 'PAID' && p.dueDate && p.dueDate < now).length,
    },
  };
}

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
  applicationDate: z.string().nullable().optional(),
  proposedFsi: z.coerce.number().min(0).optional(),
  proposedFar: z.coerce.number().min(0).optional(),
  builtUpArea: z.coerce.number().min(0).optional(),
  layoutApproved: z.boolean().optional(),
  status: z.enum(PERMIT_STATUSES).optional(),
  sanctionNo: z.string().optional(),
  validUntil: z.string().nullable().optional(),
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
    for (const key of ['applicationDate', 'validUntil'] as const) {
      if (body[key] !== undefined) data[key] = body[key] ? new Date(body[key]!) : null;
    }
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
// Scrutiny of a filed document
//
// Only the permit document set, and only for whoever manages permits. Filing a
// document is one thing; accepting it is the decision this records.
// ---------------------------------------------------------------------------

constructionRouter.patch(
  '/documents/:id/review',
  requireCapability(CAPABILITIES.CONSTRUCTION_MANAGE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(DOCUMENT_REVIEW_STATUSES),
        note: z.string().max(500).optional().default(''),
      })
      .parse(req.body);

    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { case: { select: { code: true } } },
    });
    if (!doc || !doc.caseId) throw notFound('Document not found.');
    if (!PERMIT_DOC_TYPES.includes(doc.type)) {
      throw badRequest(`"${doc.type}" is not part of the building-permit document set.`);
    }
    await assertCaseAccess(req, doc.caseId);

    const row = await prisma.document.update({
      where: { id: doc.id },
      data: {
        reviewStatus: body.status,
        reviewNote: body.note,
        // Back to "not yet looked at" clears the record of who looked.
        reviewedAt: body.status === 'PENDING' ? null : new Date(),
        reviewedByName: body.status === 'PENDING' ? '' : req.user!.name,
      },
    });

    await audit(req, {
      action: 'DOCUMENT_REVIEWED',
      entity: 'Document',
      entityId: row.id,
      caseCode: doc.case?.code ?? '',
      summary: `${row.type} v${row.version} → ${row.reviewStatus.toLowerCase()}`,
      before: { reviewStatus: doc.reviewStatus },
      after: { reviewStatus: row.reviewStatus, note: row.reviewNote },
    });

    res.json(row);
  })
);

// ---------------------------------------------------------------------------
// Permit fees
//
// The permits desk raises the demand itself — it owns the scrutiny, so it knows
// what is chargeable — but only for the permit fee types. Everything else, and
// recording the receipt, stays with Finance under payments:manage.
// ---------------------------------------------------------------------------

const feeSchema = z.object({
  caseId: z.string().min(1),
  type: z.string().refine((t) => PERMIT_PAYMENT_TYPES.includes(t), 'Not a building-permit fee.'),
  label: z.string().min(2),
  amount: z.coerce.number().positive(),
  dueDate: z.string().optional().nullable(),
  note: z.string().optional().default(''),
});

constructionRouter.post(
  '/fees',
  requireCapability(CAPABILITIES.CONSTRUCTION_MANAGE),
  asyncHandler(async (req, res) => {
    const body = feeSchema.parse(req.body);
    await assertCaseAccess(req, body.caseId);

    const row = await prisma.payment.create({
      data: { ...body, dueDate: body.dueDate ? new Date(body.dueDate) : null },
      include: { case: { select: { code: true, applicant: { select: { contactUserId: true } } } } },
    });

    await audit(req, {
      action: 'PERMIT_FEE_RAISED',
      entity: 'Payment',
      entityId: row.id,
      caseCode: row.case.code,
      summary: `${row.label} of ₹${row.amount.toLocaleString('en-IN')} raised against the building permit`,
      after: { type: row.type, amount: row.amount, dueDate: row.dueDate },
    });

    await notify({
      userIds: row.case.applicant.contactUserId ? [row.case.applicant.contactUserId] : [],
      roleKeys: [ROLES.FINANCE_OFFICER],
      type: 'FINANCIAL',
      title: `${row.case.code} — building permit fee raised`,
      message: `${row.label} of ₹${row.amount.toLocaleString('en-IN')}${
        row.dueDate ? `, due ${row.dueDate.toDateString()}` : ''
      }.`,
      caseId: row.caseId,
      link: `/payments`,
    });

    res.status(201).json(row);
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
