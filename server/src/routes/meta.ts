import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { getSettings } from '../lib/settings';
import { prisma } from '../lib/prisma';
import { parseJson } from '../lib/json';
import {
  CASE_STATUS,
  DOCUMENT_TYPES,
  ENTITY_TYPES,
  GRIEVANCE_CATEGORIES,
  HOLDING_TYPES,
  LAND_USES,
  MODES_OF_ALLOTMENT,
  NOC_TYPES,
  OBJECTIVE_CATEGORIES,
  PAYMENT_TYPES,
  PERMIT_DOCUMENT_TYPES,
  PERMIT_PAYMENT_TYPES,
  PERMIT_STATUSES,
  PHASES,
  SECTORS,
  THEME_CITIES,
} from '../lib/enums';

export const metaRouter = Router();

/**
 * One call the client makes after login: master data (admin-editable values win
 * over the built-in defaults), the stage catalogue, and the role list.
 */
metaRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    const [stages, roles] = await Promise.all([
      prisma.stage.findMany({ orderBy: { order: 'asc' } }),
      prisma.role.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);

    const listOr = (key: string, fallback: any[]) => {
      const v = settings[key];
      return Array.isArray(v) && v.length ? v : fallback;
    };

    res.json({
      modes: listOr('master_modes', MODES_OF_ALLOTMENT),
      objectiveCategories: listOr('master_objective_categories', OBJECTIVE_CATEGORIES),
      entityTypes: listOr('master_entity_types', ENTITY_TYPES),
      holdingTypes: listOr('master_holding_types', HOLDING_TYPES),
      sectors: listOr('master_sectors', SECTORS),
      themeCities: listOr('master_theme_cities', THEME_CITIES),
      landUses: listOr('master_land_uses', LAND_USES),
      documentTypes: listOr('master_document_types', DOCUMENT_TYPES),
      nocTypes: listOr('master_noc_types', NOC_TYPES),
      paymentTypes: PAYMENT_TYPES,
      permitDocumentTypes: PERMIT_DOCUMENT_TYPES,
      permitPaymentTypes: PERMIT_PAYMENT_TYPES,
      permitStatuses: PERMIT_STATUSES,
      grievanceCategories: GRIEVANCE_CATEGORIES,
      phases: PHASES,
      caseStatuses: Object.values(CASE_STATUS),
      currency: settings.currency ?? 'INR',
      timezone: settings.timezone ?? 'Asia/Kolkata',
      organisation: {
        name: settings.org_name ?? 'Andhra Pradesh Capital Region Development Authority',
        shortName: settings.org_short_name ?? 'APCRDA',
        portalName: settings.org_portal_name ?? 'Amaravati Land Allotment Portal',
        fiscalYearStart: settings.fiscal_year_start ?? '04-01',
      },
      roles: roles.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        capabilities: parseJson<string[]>(r.capabilities, []),
      })),
      stages: stages.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        order: s.order,
        phase: s.phase,
        type: s.type,
        ownerRoleKey: s.ownerRoleKey,
        coOwnerRole: s.coOwnerRole,
        slaDays: s.slaDays,
        maxRounds: s.maxRounds,
        roundLabels: parseJson<string[]>(s.roundLabels, ['R0']),
        outcomes: parseJson<any[]>(s.outcomes, []),
        fields: parseJson<any[]>(s.fields, []),
        docTypes: parseJson<string[]>(s.docTypes, []),
        routing: parseJson<any>(s.routing, {}),
        optional: s.optional,
        enabled: s.enabled,
        description: s.description,
      })),
      workflow: {
        loiValidityDays: settings.loi_validity_days ?? 90,
        cabinetTestExtentAcres: settings.cabinet_test_extent_acres ?? 25,
        commencementDeadlineYears: settings.commencement_deadline_years ?? 2,
        penaltyRatePctPerAnnum: settings.penalty_rate_pct_per_annum ?? 12,
      },
    });
  })
);
