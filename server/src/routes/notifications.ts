import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, pageParams, paged } from '../lib/http';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 30);
    const where: any = { userId: req.user!.id };
    if (req.query.unread === 'true') where.read = false;

    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { case: { select: { id: true, code: true } } },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, read: false } }),
    ]);

    res.json({ ...paged(items, total, page, pageSize), unread });
  })
);

notificationsRouter.post(
  '/read',
  asyncHandler(async (req, res) => {
    const { ids, all } = z
      .object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() })
      .parse(req.body ?? {});

    await prisma.notification.updateMany({
      where: { userId: req.user!.id, ...(all ? {} : { id: { in: ids ?? [] } }) },
      data: { read: true },
    });
    const unread = await prisma.notification.count({ where: { userId: req.user!.id, read: false } });
    res.json({ ok: true, unread });
  })
);
