import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { diff, parseJson } from '../lib/json';
import { hashPassword, randomToken, revokeAllForUser } from '../lib/auth';
import { CAPABILITIES, ROLES } from '../lib/enums';
import { requireCapability } from '../middleware/auth';

export const usersRouter = Router();

const shape = {
  id: true,
  name: true,
  email: true,
  roleKey: true,
  wing: true,
  committee: true,
  designation: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  mustReset: true,
} as const;

/** Everyone can read the directory (needed for assignee pickers); only admins write. */
usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 25);
    const and: any[] = [{ deletedAt: null }];
    const q = String(req.query.q ?? '').trim();
    if (q) and.push({ OR: [{ name: { contains: q } }, { email: { contains: q } }] });
    if (req.query.roleKey && req.query.roleKey !== 'ALL') and.push({ roleKey: String(req.query.roleKey) });
    if (req.query.status && req.query.status !== 'ALL') and.push({ status: String(req.query.status) });

    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { ...shape, role: { select: { name: true } } },
        orderBy: [{ roleKey: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  })
);

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  roleKey: z.string().min(2),
  wing: z.string().optional().nullable(),
  committee: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

usersRouter.post(
  '/',
  requireCapability(CAPABILITIES.USERS_MANAGE),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const role = await prisma.role.findUnique({ where: { key: body.roleKey } });
    if (!role) throw badRequest(`Unknown role "${body.roleKey}".`);

    const row = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase().trim(),
        passwordHash: await hashPassword(body.password),
        roleKey: body.roleKey,
        wing: body.wing ?? null,
        committee: body.committee ?? null,
        designation: body.designation ?? null,
        phone: body.phone ?? null,
      },
      select: shape,
    });

    await audit(req, {
      action: 'USER_CREATED',
      entity: 'User',
      entityId: row.id,
      summary: `${row.email} created as ${role.name}`,
      after: { email: row.email, roleKey: row.roleKey },
    });
    res.status(201).json(row);
  })
);

usersRouter.patch(
  '/:id',
  requireCapability(CAPABILITIES.USERS_MANAGE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        roleKey: z.string().optional(),
        wing: z.string().nullable().optional(),
        committee: z.string().nullable().optional(),
        designation: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
      })
      .parse(req.body);

    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('User not found.');

    // Guard against locking everyone out of administration.
    if ((body.roleKey && body.roleKey !== ROLES.SUPER_ADMIN) || body.status === 'SUSPENDED') {
      if (before.roleKey === ROLES.SUPER_ADMIN) {
        const admins = await prisma.user.count({
          where: { roleKey: ROLES.SUPER_ADMIN, status: 'ACTIVE', deletedAt: null },
        });
        if (admins <= 1) throw badRequest('At least one active Super Admin must remain.');
      }
    }

    const after = await prisma.user.update({ where: { id: req.params.id }, data: body, select: shape });
    if (body.status === 'SUSPENDED') await revokeAllForUser(after.id);

    const d = diff(before as any, after as any);
    await audit(req, {
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: after.id,
      summary: `${after.email}: ${Object.keys(d.after).join(', ')}`,
      before: d.before,
      after: d.after,
    });
    res.json(after);
  })
);

usersRouter.post(
  '/:id/reset-password',
  requireCapability(CAPABILITIES.USERS_MANAGE),
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: z.string().min(8).optional() }).parse(req.body ?? {});
    const temp = password ?? `Apcrda@${randomToken().slice(0, 6)}`;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(temp), mustReset: true, failedLogins: 0, lockedUntil: null },
      select: shape,
    });
    await revokeAllForUser(user.id);
    await audit(req, {
      action: 'USER_PASSWORD_RESET',
      entity: 'User',
      entityId: user.id,
      summary: `Password reset by administrator for ${user.email}`,
    });

    // Returned once so the admin can hand it over; never stored in plain text.
    res.json({ ...user, temporaryPassword: temp });
  })
);

usersRouter.delete(
  '/:id',
  requireCapability(CAPABILITIES.USERS_MANAGE),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound('User not found.');
    if (user.roleKey === ROLES.SUPER_ADMIN) {
      const admins = await prisma.user.count({ where: { roleKey: ROLES.SUPER_ADMIN, deletedAt: null } });
      if (admins <= 1) throw badRequest('At least one Super Admin must remain.');
    }
    await prisma.user.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), status: 'SUSPENDED' },
    });
    await revokeAllForUser(req.params.id);
    await audit(req, {
      action: 'USER_DEACTIVATED',
      entity: 'User',
      entityId: req.params.id,
      summary: `${user.email} deactivated (soft-deleted)`,
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Roles & the permissions matrix
// ---------------------------------------------------------------------------

export const rolesRouter = Router();

rolesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [roles, permissions, counts] = await Promise.all([
      prisma.role.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.permission.findMany(),
      prisma.user.groupBy({ by: ['roleKey'], where: { deletedAt: null }, _count: true }),
    ]);

    res.json(
      roles.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        capabilities: parseJson<string[]>(r.capabilities, []),
        userCount: counts.find((c) => c.roleKey === r.key)?._count ?? 0,
        permissions: permissions
          .filter((p) => p.roleKey === r.key)
          .map((p) => ({ stageId: p.stageId, canView: p.canView, canAct: p.canAct })),
      }))
    );
  })
);

rolesRouter.put(
  '/:key/permissions',
  requireCapability(CAPABILITIES.WORKFLOW_MANAGE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        permissions: z.array(
          z.object({ stageId: z.string(), canView: z.boolean(), canAct: z.boolean() })
        ),
      })
      .parse(req.body);

    const role = await prisma.role.findUnique({ where: { key: req.params.key } });
    if (!role) throw notFound('Role not found.');
    if (role.key === ROLES.SUPER_ADMIN) throw badRequest('Super Admin permissions are fixed.');

    for (const p of body.permissions) {
      await prisma.permission.upsert({
        where: { roleKey_stageId: { roleKey: role.key, stageId: p.stageId } },
        create: { roleKey: role.key, stageId: p.stageId, canView: p.canView, canAct: p.canAct },
        update: { canView: p.canView, canAct: p.canAct },
      });
    }

    await audit(req, {
      action: 'PERMISSIONS_UPDATED',
      entity: 'Role',
      entityId: role.key,
      summary: `Permission matrix updated for ${role.name}`,
      after: body.permissions.filter((p) => p.canAct).map((p) => p.stageId),
    });

    const permissions = await prisma.permission.findMany({ where: { roleKey: role.key } });
    res.json(permissions);
  })
);
