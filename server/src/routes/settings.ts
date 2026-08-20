import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { audit } from '../lib/audit';
import { parseJson, toJson } from '../lib/json';
import { getSettings, invalidateSettings } from '../lib/settings';
import { CAPABILITIES } from '../lib/enums';
import { requireCapability } from '../middleware/auth';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  requireCapability(CAPABILITIES.SETTINGS_MANAGE, CAPABILITIES.AUDIT_VIEW),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    res.json(
      rows.map((r) => ({
        key: r.key,
        label: r.label,
        group: r.group,
        type: r.type,
        help: r.help,
        value:
          r.type === 'json' || r.type === 'list'
            ? parseJson<any>(r.value, r.type === 'list' ? [] : {})
            : r.type === 'number'
              ? Number(r.value)
              : r.type === 'boolean'
                ? r.value === 'true'
                : r.value,
        updatedAt: r.updatedAt,
      }))
    );
  })
);

settingsRouter.put(
  '/',
  requireCapability(CAPABILITIES.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    const body = z.object({ values: z.record(z.any()) }).parse(req.body);
    const keys = Object.keys(body.values);
    if (!keys.length) throw badRequest('No settings supplied.');

    const existing = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const changes: Record<string, { from: any; to: any }> = {};

    for (const row of existing) {
      const next = body.values[row.key];
      const serialised =
        row.type === 'json' || row.type === 'list' ? toJson(next) : String(next);
      if (serialised === row.value) continue;
      changes[row.key] = { from: row.value, to: serialised };
      await prisma.setting.update({ where: { key: row.key }, data: { value: serialised } });
    }

    const unknown = keys.filter((k) => !existing.some((e) => e.key === k));
    if (unknown.length) throw badRequest(`Unknown setting key(s): ${unknown.join(', ')}`);

    invalidateSettings();
    await audit(req, {
      action: 'SETTINGS_UPDATED',
      entity: 'Setting',
      entityId: keys.join(','),
      summary: `Updated ${Object.keys(changes).length} setting(s): ${Object.keys(changes).join(', ')}`,
      before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])),
      after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])),
    });

    res.json({ ok: true, updated: Object.keys(changes) });
  })
);

// ---------------------------------------------------------------------------
// Workflow configuration (stage owners, SLA days, enable/disable)
// ---------------------------------------------------------------------------

export const workflowRouter = Router();

workflowRouter.get(
  '/stages',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
    res.json(
      rows.map((s) => ({
        ...s,
        roundLabels: parseJson<string[]>(s.roundLabels, []),
        outcomes: parseJson<any[]>(s.outcomes, []),
        fields: parseJson<any[]>(s.fields, []),
        docTypes: parseJson<string[]>(s.docTypes, []),
        routing: parseJson<any>(s.routing, {}),
      }))
    );
  })
);

workflowRouter.patch(
  '/stages/:id',
  requireCapability(CAPABILITIES.WORKFLOW_MANAGE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        ownerRoleKey: z.string().optional(),
        coOwnerRole: z.string().nullable().optional(),
        slaDays: z.coerce.number().int().min(0).max(3650).optional(),
        maxRounds: z.coerce.number().int().min(1).max(10).optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
      })
      .parse(req.body);

    const before = await prisma.stage.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Stage not found.');

    if (body.ownerRoleKey) {
      const role = await prisma.role.findUnique({ where: { key: body.ownerRoleKey } });
      if (!role) throw badRequest(`Unknown role "${body.ownerRoleKey}".`);
    }
    if (body.enabled === false && !before.optional) {
      const active = await prisma.stageInstance.count({
        where: { stageId: before.id, status: 'ACTIVE' },
      });
      if (active > 0) {
        throw badRequest(
          `${active} case(s) are currently sitting on stage ${before.code}. Clear them before disabling the stage.`
        );
      }
    }

    const after = await prisma.stage.update({ where: { id: req.params.id }, data: body });
    await audit(req, {
      action: 'STAGE_CONFIG_UPDATED',
      entity: 'Stage',
      entityId: after.id,
      summary: `Stage ${after.code} updated: ${Object.keys(body).join(', ')}`,
      before: { slaDays: before.slaDays, ownerRoleKey: before.ownerRoleKey, enabled: before.enabled },
      after: { slaDays: after.slaDays, ownerRoleKey: after.ownerRoleKey, enabled: after.enabled },
    });
    res.json(after);
  })
);
