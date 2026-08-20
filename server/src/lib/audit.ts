import type { Request } from 'express';
import { prisma } from './prisma';
import { toJson } from './json';

type AuditInput = {
  action: string;
  entity: string;
  entityId?: string;
  caseCode?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Append-only. Nothing in the app ever updates or deletes an AuditLog row —
 * the audit route exposes read + filter only.
 */
export async function audit(req: Request | null, input: AuditInput) {
  const actor = req?.user;
  await prisma.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? 'System',
      actorRole: actor?.roleKey ?? 'SYSTEM',
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? '',
      caseCode: input.caseCode ?? '',
      summary: input.summary ?? '',
      before: input.before === undefined ? null : toJson(input.before),
      after: input.after === undefined ? null : toJson(input.after),
      ip: (req?.headers['x-forwarded-for'] as string) || req?.socket?.remoteAddress || '',
    },
  });
}

/** For seeds and background jobs where there is no request. */
export async function auditSystem(input: AuditInput & { actorId?: string; actorName?: string; actorRole?: string }) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? 'System',
      actorRole: input.actorRole ?? 'SYSTEM',
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? '',
      caseCode: input.caseCode ?? '',
      summary: input.summary ?? '',
      before: input.before === undefined ? null : toJson(input.before),
      after: input.after === undefined ? null : toJson(input.after),
      ip: '',
    },
  });
}
