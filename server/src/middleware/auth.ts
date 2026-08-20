import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/auth';
import { asyncHandler, forbidden, unauthorized } from '../lib/http';
import { parseJson } from '../lib/json';
import { ROLES } from '../lib/enums';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface UserContext {
      id: string;
      name: string;
      email: string;
      roleKey: string;
      roleName: string;
      capabilities: string[];
      applicantIds: string[];
    }
    interface Request {
      user?: UserContext;
    }
  }
}

/** Verifies the bearer token and hydrates req.user with live role data. */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err: any) {
    throw unauthorized(err?.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid session');
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: { role: true, applicantProfiles: { select: { id: true } } },
  });
  if (!user || user.deletedAt) throw unauthorized('Account no longer exists');
  if (user.status !== 'ACTIVE') throw forbidden('This account is suspended. Contact the administrator.');

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.roleKey,
    roleName: user.role.name,
    capabilities: parseJson<string[]>(user.role.capabilities, []),
    applicantIds: user.applicantProfiles.map((a) => a.id),
  };
  next();
});

export function requireCapability(...caps: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.roleKey === ROLES.SUPER_ADMIN) return next();
    const ok = caps.some((c) => req.user!.capabilities.includes(c));
    if (!ok) return next(forbidden(`Missing capability: ${caps.join(' or ')}`));
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.roleKey === ROLES.SUPER_ADMIN) return next();
    if (!roles.includes(req.user.roleKey)) return next(forbidden());
    next();
  };
}

export const isInvestor = (req: Request) => req.user?.roleKey === ROLES.INVESTOR;
export const isReadOnly = (req: Request) => req.user?.roleKey === ROLES.VIEWER;

/** Viewer/Auditor is read-only everywhere; block anything that mutates. */
export function blockReadOnly(req: Request, _res: Response, next: NextFunction) {
  if (isReadOnly(req) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next(forbidden('The Viewer / Auditor role is read-only.'));
  }
  next();
}

/**
 * Investors are strictly scoped to cases linked to their applicant profiles.
 * Returns a Prisma where-fragment merged into every case query.
 */
export function caseScope(req: Request): Record<string, any> {
  if (isInvestor(req)) {
    return { applicantId: { in: req.user!.applicantIds.length ? req.user!.applicantIds : ['__none__'] } };
  }
  return {};
}

export async function assertCaseAccess(req: Request, caseId: string) {
  const found = await prisma.case.findFirst({
    where: { id: caseId, deletedAt: null, ...caseScope(req) },
    select: { id: true },
  });
  if (!found) throw forbidden('You do not have access to this case.');
}
