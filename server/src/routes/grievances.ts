import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, forbidden, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { getSettings } from '../lib/settings';
import { CAPABILITIES, GRIEVANCE_CATEGORIES, ROLES } from '../lib/enums';
import { assertCaseAccess, caseScope, isInvestor, requireCapability } from '../middleware/auth';
import { addDays } from '../workflow/engine';

export const grievancesRouter = Router();

grievancesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 25);
    const and: any[] = [];

    if (isInvestor(req)) {
      and.push({ OR: [{ raisedById: req.user!.id }, { case: caseScope(req) }] });
    }
    if (req.query.caseId) and.push({ caseId: String(req.query.caseId) });
    if (req.query.status && req.query.status !== 'ALL') and.push({ status: String(req.query.status) });
    if (req.query.category && req.query.category !== 'ALL') and.push({ category: String(req.query.category) });
    if (req.query.assigneeId) and.push({ assigneeId: String(req.query.assigneeId) });
    if (req.query.overdue === 'true') {
      and.push({ slaDueAt: { lt: new Date() }, status: { in: ['OPEN', 'UNDER_REVIEW'] } });
    }
    const q = String(req.query.q ?? '').trim();
    if (q) and.push({ OR: [{ code: { contains: q } }, { subject: { contains: q } }] });

    const where = and.length ? { AND: and } : {};
    const [items, total] = await Promise.all([
      prisma.grievance.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          case: { select: { id: true, code: true, title: true } },
          raisedBy: { select: { name: true } },
          assignee: { select: { id: true, name: true } },
        },
      }),
      prisma.grievance.count({ where }),
    ]);

    const now = new Date();
    res.json(
      paged(
        items.map((g) => ({
          ...g,
          isOverdue: !!g.slaDueAt && g.slaDueAt < now && ['OPEN', 'UNDER_REVIEW'].includes(g.status),
        })),
        total,
        page,
        pageSize
      )
    );
  })
);

grievancesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.grievance.findUnique({
      where: { id: req.params.id },
      include: {
        case: { select: { id: true, code: true, title: true } },
        raisedBy: { select: { name: true, email: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    if (!row) throw notFound('Grievance not found.');
    if (isInvestor(req) && row.raisedById !== req.user!.id) throw forbidden('Not your grievance.');
    res.json(row);
  })
);

const createSchema = z.object({
  caseId: z.string().optional().nullable(),
  subject: z.string().min(5),
  description: z.string().min(10),
  category: z.enum(GRIEVANCE_CATEGORIES as [string, ...string[]]).default('DECISION_APPEAL'),
});

grievancesRouter.post(
  '/',
  requireCapability(CAPABILITIES.GRIEVANCE_RAISE, CAPABILITIES.GRIEVANCE_RESOLVE),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    if (body.caseId) await assertCaseAccess(req, body.caseId);

    const settings = await getSettings();
    const slaDays = Number(settings.grievance_sla_days ?? 15);

    const count = await prisma.grievance.count();
    const row = await prisma.grievance.create({
      data: {
        code: `GRV/${new Date().getFullYear()}/${String(count + 1).padStart(4, '0')}`,
        caseId: body.caseId || null,
        raisedById: req.user!.id,
        subject: body.subject,
        description: body.description,
        category: body.category,
        slaDueAt: addDays(new Date(), slaDays),
      },
      include: { case: { select: { code: true } } },
    });

    await audit(req, {
      action: 'GRIEVANCE_RAISED',
      entity: 'Grievance',
      entityId: row.id,
      caseCode: row.case?.code ?? '',
      summary: `${row.code}: ${row.subject}`,
    });
    await notify({
      roleKeys: [ROLES.LANDS_OFFICER, ROLES.SUPER_ADMIN],
      type: 'GRIEVANCE_RAISED',
      title: `New grievance ${row.code}`,
      message: `${row.subject} — SLA ${slaDays} days.`,
      caseId: row.caseId,
      link: `/grievances`,
    });

    res.status(201).json(row);
  })
);

grievancesRouter.patch(
  '/:id',
  requireCapability(CAPABILITIES.GRIEVANCE_RESOLVE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']).optional(),
        assigneeId: z.string().nullable().optional(),
        resolution: z.string().optional(),
      })
      .parse(req.body);

    const before = await prisma.grievance.findUniqueOrThrow({ where: { id: req.params.id } });

    if ((body.status === 'RESOLVED' || body.status === 'REJECTED') && !(body.resolution ?? before.resolution).trim()) {
      throw forbidden('A resolution note is required when closing a grievance.');
    }

    const after = await prisma.grievance.update({
      where: { id: req.params.id },
      data: {
        ...body,
        resolvedAt: body.status === 'RESOLVED' || body.status === 'REJECTED' ? new Date() : undefined,
      },
      include: { case: { select: { code: true } }, raisedBy: { select: { id: true } } },
    });

    await audit(req, {
      action: 'GRIEVANCE_UPDATED',
      entity: 'Grievance',
      entityId: after.id,
      caseCode: after.case?.code ?? '',
      summary: `${after.code} → ${after.status}`,
      before: { status: before.status, assigneeId: before.assigneeId },
      after: { status: after.status, assigneeId: after.assigneeId, resolution: after.resolution },
    });

    if (after.raisedBy?.id) {
      await notify({
        userIds: [after.raisedBy.id],
        type: 'GRIEVANCE_UPDATE',
        title: `${after.code} — ${after.status.replace('_', ' ').toLowerCase()}`,
        message: after.resolution || `Your grievance is now ${after.status.replace('_', ' ').toLowerCase()}.`,
        caseId: after.caseId,
        link: '/grievances',
      });
    }

    res.json(after);
  })
);
