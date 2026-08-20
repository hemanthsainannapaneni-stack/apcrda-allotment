import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from './env';
import { prisma } from './prisma';

export type AccessClaims = {
  sub: string;
  email: string;
  name: string;
  roleKey: string;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(claims: AccessClaims) {
  return jwt.sign(claims, env.accessSecret, { expiresIn: env.accessTtl } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.accessSecret) as AccessClaims;
}

export async function issueRefreshToken(userId: string, rememberMe: boolean) {
  const days = rememberMe ? env.rememberMeTtlDays : env.refreshTtlDays;
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

export async function rotateRefreshToken(token: string) {
  const existing = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: { include: { role: true } } },
  });
  if (!existing || existing.revoked || existing.expiresAt < new Date()) return null;
  if (existing.user.status !== 'ACTIVE' || existing.user.deletedAt) return null;

  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revoked: true } });
  const days = Math.ceil((existing.expiresAt.getTime() - existing.createdAt.getTime()) / 86_400_000);
  const next = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + Math.max(1, days) * 86_400_000);
  await prisma.refreshToken.create({ data: { token: next, userId: existing.userId, expiresAt } });

  return { token: next, expiresAt, user: existing.user };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({ where: { token }, data: { revoked: true } });
}

export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
}

export function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}
