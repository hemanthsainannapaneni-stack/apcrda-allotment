import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../lib/env';
import { asyncHandler, badRequest, unauthorized } from '../lib/http';
import { audit } from '../lib/audit';
import { parseJson } from '../lib/json';
import {
  hashPassword,
  issueRefreshToken,
  randomToken,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../lib/auth';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

function publicUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.roleKey,
    roleName: user.role?.name ?? user.roleKey,
    capabilities: parseJson<string[]>(user.role?.capabilities, []),
    wing: user.wing,
    committee: user.committee,
    designation: user.designation,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
  };
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password, rememberMe } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { role: true },
    });

    // Same message either way so the form can't be used to enumerate accounts.
    const invalid = unauthorized('Incorrect email or password.');
    if (!user || user.deletedAt) throw invalid;

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw unauthorized(`Account locked after too many failed attempts. Try again in ${mins} minute(s).`);
    }
    if (user.status !== 'ACTIVE') throw unauthorized('This account is suspended. Contact the administrator.');

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const failedLogins = user.failedLogins + 1;
      const locked = failedLogins >= env.maxFailedLogins;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: locked ? 0 : failedLogins,
          lockedUntil: locked ? new Date(Date.now() + env.lockoutMinutes * 60_000) : null,
        },
      });
      if (locked) {
        throw unauthorized(
          `Too many failed attempts. The account is locked for ${env.lockoutMinutes} minutes.`
        );
      }
      throw invalid;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      include: { role: true },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      roleKey: user.roleKey,
    });
    const refresh = await issueRefreshToken(user.id, rememberMe);

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      roleKey: user.roleKey,
      roleName: user.role.name,
      capabilities: [],
      applicantIds: [],
    };
    await audit(req, { action: 'LOGIN', entity: 'User', entityId: user.id, summary: `${user.email} signed in` });

    res.json({
      accessToken,
      refreshToken: refresh.token,
      expiresIn: env.accessTtl,
      user: publicUser(updated),
    });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = z.object({ refreshToken: z.string().min(10) }).parse(req.body).refreshToken;
    const rotated = await rotateRefreshToken(token);
    if (!rotated) throw unauthorized('Session expired. Please sign in again.');

    const accessToken = signAccessToken({
      sub: rotated.user.id,
      email: rotated.user.email,
      name: rotated.user.name,
      roleKey: rotated.user.roleKey,
    });
    res.json({ accessToken, refreshToken: rotated.token, user: publicUser(rotated.user) });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.body?.refreshToken;
    if (token) await revokeRefreshToken(token);
    res.json({ ok: true });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      include: { role: true, applicantProfiles: { select: { id: true, name: true } } },
    });
    res.json({ ...publicUser(user), applicantProfiles: user.applicantProfiles });
  })
);

authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (user && !user.deletedAt) {
      const token = randomToken();
      await prisma.passwordReset.create({
        data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) },
      });
      // Demo mail driver: the link is printed to the API console.
      // eslint-disable-next-line no-console
      console.log(`[mail] password reset for ${user.email}: ${env.clientOrigin}/reset-password?token=${token}`);
    }

    // Always the same response so the endpoint can't confirm which emails exist.
    res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
  })
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = z
      .object({ token: z.string().min(10), password: z.string().min(8, 'Password must be at least 8 characters.') })
      .parse(req.body);

    const reset = await prisma.passwordReset.findUnique({ where: { token }, include: { user: true } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) throw badRequest('This reset link is invalid or expired.');

    await prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, mustReset: false },
    });
    await prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    await revokeAllForUser(reset.userId);

    res.json({ ok: true });
  })
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
      .parse(req.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest('Your current password is incorrect.');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustReset: false },
    });
    await audit(req, { action: 'PASSWORD_CHANGED', entity: 'User', entityId: user.id, summary: 'Password changed' });
    res.json({ ok: true });
  })
);
