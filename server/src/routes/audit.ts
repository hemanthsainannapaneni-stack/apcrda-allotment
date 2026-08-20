import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler, pageParams, paged } from '../lib/http';
import { parseJson } from '../lib/json';
import { CAPABILITIES } from '../lib/enums';
import { requireCapability } from '../middleware/auth';

export const auditRouter = Router();

/** Read-only by design — nothing in the app writes to this route. */
auditRouter.get(
  '/',
  requireCapability(CAPABILITIES.AUDIT_VIEW),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 50);
    const and: any[] = [];

    const q = String(req.query.q ?? '').trim();
    if (q) {
      and.push({
        OR: [
          { summary: { contains: q } },
          { caseCode: { contains: q } },
          { actorName: { contains: q } },
          { entityId: { contains: q } },
        ],
      });
    }
    if (req.query.action && req.query.action !== 'ALL') and.push({ action: String(req.query.action) });
    if (req.query.entity && req.query.entity !== 'ALL') and.push({ entity: String(req.query.entity) });
    if (req.query.actorId) and.push({ actorId: String(req.query.actorId) });
    if (req.query.from) and.push({ createdAt: { gte: new Date(String(req.query.from)) } });
    if (req.query.to) and.push({ createdAt: { lte: new Date(String(req.query.to)) } });

    const where = and.length ? { AND: and } : {};
    const [items, total, actions, entities] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
      prisma.auditLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
    ]);

    res.json({
      ...paged(
        items.map((r) => ({
          ...r,
          before: parseJson<any>(r.before, null),
          after: parseJson<any>(r.after, null),
        })),
        total,
        page,
        pageSize
      ),
      facets: {
        actions: actions.map((a) => ({ value: a.action, count: a._count })),
        entities: entities.map((e) => ({ value: e.entity, count: e._count })),
      },
    });
  })
);
