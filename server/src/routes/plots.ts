import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { diff } from '../lib/json';
import { CAPABILITIES } from '../lib/enums';
import { requireCapability } from '../middleware/auth';

export const plotsRouter = Router();

plotsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 25);
    const q = String(req.query.q ?? '').trim();
    const and: any[] = [];

    if (q) {
      and.push({
        OR: [{ code: { contains: q } }, { name: { contains: q } }, { surveyRef: { contains: q } }],
      });
    }
    for (const [key, param] of [
      ['themeCity', 'themeCity'],
      ['availability', 'availability'],
      ['objectiveCategory', 'objectiveCategory'],
      ['landUse', 'landUse'],
      ['zoneCode', 'zoneCode'],
    ] as const) {
      const v = req.query[param];
      if (v && v !== 'ALL') and.push({ [key]: String(v) });
    }

    const where = and.length ? { AND: and } : {};
    const [items, total] = await Promise.all([
      prisma.plot.findMany({
        where,
        orderBy: { code: 'asc' },
        skip,
        take,
        include: { _count: { select: { cases: true } } },
      }),
      prisma.plot.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  })
);

plotsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.plot.findUnique({
      where: { id: req.params.id },
      include: {
        cases: { select: { id: true, code: true, title: true, status: true }, where: { deletedAt: null } },
        invitations: { include: { invitation: true } },
      },
    });
    if (!row) throw notFound('Plot not found.');
    res.json(row);
  })
);

const plotSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  extentAcres: z.coerce.number().positive(),
  surveyRef: z.string().min(1),
  gisRef: z.string().optional().default(''),
  zoneCode: z.string().min(1),
  themeCity: z.string().min(1),
  landUse: z.string().min(1),
  fsi: z.coerce.number().min(0).default(2),
  far: z.coerce.number().min(0).default(2),
  reservePrice: z.coerce.number().min(0),
  objectiveCategory: z.string().min(1),
  landCategory: z.enum(['NORMAL', 'SENSITIVE']).default('NORMAL'),
  availability: z.enum(['AVAILABLE', 'RESERVED', 'ALLOTTED', 'WITHDRAWN']).default('AVAILABLE'),
  notes: z.string().optional().default(''),
});

plotsRouter.post(
  '/',
  requireCapability(CAPABILITIES.PLOTS_MANAGE),
  asyncHandler(async (req, res) => {
    const row = await prisma.plot.create({ data: plotSchema.parse(req.body) });
    await audit(req, {
      action: 'PLOT_CREATED',
      entity: 'Plot',
      entityId: row.id,
      summary: `Plot ${row.code} added to inventory`,
      after: row,
    });
    res.status(201).json(row);
  })
);

plotsRouter.patch(
  '/:id',
  requireCapability(CAPABILITIES.PLOTS_MANAGE),
  asyncHandler(async (req, res) => {
    const before = await prisma.plot.findUniqueOrThrow({ where: { id: req.params.id } });
    const after = await prisma.plot.update({
      where: { id: req.params.id },
      data: plotSchema.partial().parse(req.body),
    });
    const d = diff(before as any, after as any);
    await audit(req, {
      action: 'PLOT_UPDATED',
      entity: 'Plot',
      entityId: after.id,
      summary: `Plot ${after.code} updated: ${Object.keys(d.after).join(', ')}`,
      before: d.before,
      after: d.after,
    });
    res.json(after);
  })
);

/** Withdrawing keeps the row; inventory is never hard-deleted. */
plotsRouter.post(
  '/:id/withdraw',
  requireCapability(CAPABILITIES.PLOTS_MANAGE),
  asyncHandler(async (req, res) => {
    const reason = z.object({ reason: z.string().min(3) }).parse(req.body).reason;
    const row = await prisma.plot.update({
      where: { id: req.params.id },
      data: { availability: 'WITHDRAWN', notes: reason },
    });
    await audit(req, {
      action: 'PLOT_WITHDRAWN',
      entity: 'Plot',
      entityId: row.id,
      summary: `Plot ${row.code} withdrawn: ${reason}`,
    });
    res.json(row);
  })
);

// ---------------------------------------------------------------------------
// Invitation documents
// ---------------------------------------------------------------------------

export const invitationsRouter = Router();

invitationsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.invitationDocument.findMany({
      orderBy: { createdAt: 'desc' },
      include: { plots: { include: { plot: { select: { id: true, code: true, name: true, extentAcres: true } } } } },
    });
    res.json(rows.map((r) => ({ ...r, plots: r.plots.map((p) => p.plot) })));
  })
);

const invitationSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(3),
  terms: z.string().optional().default(''),
  mode: z.string().min(1),
  plotIds: z.array(z.string()).default([]),
  closesAt: z.string().datetime().optional().nullable(),
});

invitationsRouter.post(
  '/',
  requireCapability(CAPABILITIES.INVITATIONS_MANAGE),
  asyncHandler(async (req, res) => {
    const body = invitationSchema.parse(req.body);
    const row = await prisma.invitationDocument.create({
      data: {
        code: body.code,
        title: body.title,
        terms: body.terms,
        mode: body.mode,
        closesAt: body.closesAt ? new Date(body.closesAt) : null,
        plots: { create: body.plotIds.map((plotId) => ({ plotId })) },
      },
      include: { plots: true },
    });
    await audit(req, {
      action: 'INVITATION_CREATED',
      entity: 'InvitationDocument',
      entityId: row.id,
      summary: `Invitation ${row.code} drafted with ${body.plotIds.length} plot(s)`,
    });
    res.status(201).json(row);
  })
);

invitationsRouter.post(
  '/:id/publish',
  requireCapability(CAPABILITIES.INVITATIONS_MANAGE),
  asyncHandler(async (req, res) => {
    const row = await prisma.invitationDocument.update({
      where: { id: req.params.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await audit(req, {
      action: 'INVITATION_PUBLISHED',
      entity: 'InvitationDocument',
      entityId: row.id,
      summary: `Invitation ${row.code} published`,
    });
    res.json(row);
  })
);

invitationsRouter.post(
  '/:id/close',
  requireCapability(CAPABILITIES.INVITATIONS_MANAGE),
  asyncHandler(async (req, res) => {
    const row = await prisma.invitationDocument.update({
      where: { id: req.params.id },
      data: { status: 'CLOSED' },
    });
    await audit(req, {
      action: 'INVITATION_CLOSED',
      entity: 'InvitationDocument',
      entityId: row.id,
      summary: `Invitation ${row.code} closed`,
    });
    res.json(row);
  })
);
