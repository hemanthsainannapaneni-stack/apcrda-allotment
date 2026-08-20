import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { parseJson, toJson } from '../lib/json';
import { getSettings } from '../lib/settings';
import { notify } from '../lib/notify';
import { audit } from '../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../lib/http';
import { CASE_STATUS, OUTCOME_KIND, ROLES, STAGE_INSTANCE_STATUS, TERMINAL_STATUSES } from '../lib/enums';
import type { StageField, StageOutcome, StageRouting } from './catalogue';

export type ParsedStage = {
  id: string;
  code: string;
  name: string;
  order: number;
  phase: string;
  type: string;
  ownerRoleKey: string;
  coOwnerRole: string | null;
  slaDays: number;
  maxRounds: number;
  roundLabels: string[];
  outcomes: StageOutcome[];
  fields: StageField[];
  docTypes: string[];
  routing: StageRouting;
  optional: boolean;
  enabled: boolean;
  description: string;
};

export async function loadStages(): Promise<ParsedStage[]> {
  const rows = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
  return rows.map(parseStage);
}

export function parseStage(row: any): ParsedStage {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    order: row.order,
    phase: row.phase,
    type: row.type,
    ownerRoleKey: row.ownerRoleKey,
    coOwnerRole: row.coOwnerRole ?? null,
    slaDays: row.slaDays,
    maxRounds: row.maxRounds,
    roundLabels: parseJson<string[]>(row.roundLabels, ['R0']),
    outcomes: parseJson<StageOutcome[]>(row.outcomes, []),
    fields: parseJson<StageField[]>(row.fields, []),
    docTypes: parseJson<string[]>(row.docTypes, []),
    routing: parseJson<StageRouting>(row.routing, {}),
    optional: row.optional,
    enabled: row.enabled,
    description: row.description,
  };
}

export function addDays(from: Date, days: number) {
  return new Date(from.getTime() + days * 86_400_000);
}

// ---------------------------------------------------------------------------
// Applicability & routing
// ---------------------------------------------------------------------------

/**
 * Optional stages declare a named predicate. Everything else is applicable
 * whenever it is enabled — the engine never hard-codes a stage id.
 */
export function isStageApplicable(stage: ParsedStage, caseRow: any, settings: Record<string, any>): boolean {
  if (!stage.enabled) return false;
  if (!stage.optional) return true;

  switch (stage.routing.applicability) {
    case 'CABINET_REQUIRED':
      return caseRow.requiresCabinet === true;
    case 'SUBCOMMITTEE_REQUIRED': {
      const modes: string[] = settings.subcommittee_required_modes ?? ['NOMINATION'];
      return caseRow.isConcessional === true || modes.includes(caseRow.mode);
    }
    default:
      return true;
  }
}

/** Walks the catalogue forward from `fromOrder`, skipping non-applicable stages. */
export function nextApplicableStage(
  fromOrder: number,
  stages: ParsedStage[],
  caseRow: any,
  settings: Record<string, any>
): ParsedStage | null {
  for (const stage of stages) {
    if (stage.order <= fromOrder) continue;
    if (isStageApplicable(stage, caseRow, settings)) return stage;
  }
  return null;
}

/** Stage 6a's rule. Result is stored on the case so Stage 7's predicate can read it. */
export function evaluateCabinetTest(caseRow: any, settings: Record<string, any>, data: Record<string, any> = {}) {
  const threshold = Number(settings.cabinet_test_extent_acres ?? 25);
  const sensitiveCategories: string[] = settings.cabinet_test_sensitive_categories ?? ['SENSITIVE'];

  const reasons: string[] = [];
  if (Number(caseRow.extentAcres) >= threshold) {
    reasons.push(`extent ${caseRow.extentAcres} ac ≥ threshold ${threshold} ac`);
  }
  if (caseRow.isConcessional) reasons.push('allotment is concessional');
  if (sensitiveCategories.includes(caseRow.landCategory)) reasons.push(`land category is ${caseRow.landCategory}`);
  if (data.overrideToCabinet === true || data.overrideToCabinet === 'true') reasons.push('manual override by Authority');

  return {
    requiresCabinet: reasons.length > 0,
    note: reasons.length ? `Routed to Cabinet: ${reasons.join('; ')}.` : 'No Cabinet trigger met — routed directly to Government Order.',
  };
}

// ---------------------------------------------------------------------------
// Stage lifecycle
// ---------------------------------------------------------------------------

type StartOpts = { round?: number; data?: Record<string, any>; silent?: boolean };

export async function startStageInstance(caseRow: any, stage: ParsedStage, opts: StartOpts = {}) {
  const round = opts.round ?? 0;
  const roundLabel = stage.roundLabels[Math.min(round, stage.roundLabels.length - 1)] ?? `R${round}`;
  const dueAt = addDays(new Date(), stage.slaDays);

  const instance = await prisma.stageInstance.create({
    data: {
      caseId: caseRow.id,
      stageId: stage.id,
      round,
      roundLabel,
      status: STAGE_INSTANCE_STATUS.ACTIVE,
      ownerRoleKey: stage.ownerRoleKey,
      data: toJson(opts.data ?? {}),
      dueAt,
    },
  });

  const updated = await prisma.case.update({
    where: { id: caseRow.id },
    data: {
      currentStageId: stage.id,
      phase: stage.phase,
      slaDueAt: dueAt,
      // A case leaves DRAFT the moment a stage goes active; terminal states are untouched.
      status: caseRow.status === CASE_STATUS.DRAFT ? CASE_STATUS.IN_PROGRESS : caseRow.status,
    },
  });

  await runStageStartEffects(updated, stage, instance);

  if (!opts.silent) {
    const roleKeys = [stage.ownerRoleKey];
    if (stage.coOwnerRole) roleKeys.push(stage.coOwnerRole);
    const investorUserIds = roleKeys.includes(ROLES.INVESTOR) ? await investorUserIdsFor(caseRow.id) : [];

    await notify({
      roleKeys: roleKeys.filter((r) => r !== ROLES.INVESTOR),
      userIds: investorUserIds,
      type: 'TASK_ASSIGNED',
      title: `Action required — ${updated.code}`,
      message: `Stage ${stage.code} · ${stage.name} (${roundLabel}) is now pending. Due ${dueAt.toDateString()}.`,
      caseId: caseRow.id,
      link: `/cases/${caseRow.id}`,
    });
  }

  return { instance, case: updated };
}

async function investorUserIdsFor(caseId: string) {
  const row = await prisma.case.findUnique({
    where: { id: caseId },
    select: { applicant: { select: { contactUserId: true } } },
  });
  return row?.applicant.contactUserId ? [row.applicant.contactUserId] : [];
}

/** Seeds the timeline for a brand-new case: Stage 0 is recorded, Stage 1 goes active. */
export async function startCaseWorkflow(caseRow: any, invitationRef = '') {
  const stages = await loadStages();
  const settings = await getSettings();

  const first = stages.find((s) => isStageApplicable(s, caseRow, settings));
  if (!first) throw badRequest('No enabled stage to start the case at.');

  // Stage 0 (inventory / invitation) belongs to APCRDA and is already done by the
  // time an application exists — record it as completed so the tracker is honest.
  if (first.type === 'SETUP') {
    const instance = await prisma.stageInstance.create({
      data: {
        caseId: caseRow.id,
        stageId: first.id,
        round: 0,
        roundLabel: first.roundLabels[0] ?? 'R0',
        status: STAGE_INSTANCE_STATUS.COMPLETED,
        ownerRoleKey: first.ownerRoleKey,
        data: toJson({ invitationRef, mode: caseRow.mode, publishedOn: new Date().toISOString().slice(0, 10) }),
        completedAt: new Date(),
      },
    });
    await prisma.decision.create({
      data: {
        stageInstanceId: instance.id,
        actorName: 'System',
        actorRole: 'SYSTEM',
        outcome: 'PUBLISHED',
        outcomeLabel: 'Published — open for application',
        kind: OUTCOME_KIND.PASS,
        remarks: invitationRef
          ? `Plot offered under invitation ${invitationRef}.`
          : 'Plot inventory published and open for application.',
      },
    });

    const next = nextApplicableStage(first.order, stages, caseRow, settings);
    if (next) return startStageInstance(caseRow, next, { silent: true });
    return { instance, case: caseRow };
  }

  return startStageInstance(caseRow, first, { silent: true });
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type DecisionInput = {
  req: Request;
  caseId: string;
  stageInstanceId: string;
  outcome: string;
  remarks: string;
  data?: Record<string, any>;
};

export async function applyDecision(input: DecisionInput) {
  const { req } = input;
  const settings = await getSettings();
  const stages = await loadStages();

  const instance = await prisma.stageInstance.findUnique({
    where: { id: input.stageInstanceId },
    include: { case: true },
  });
  if (!instance || instance.caseId !== input.caseId) throw notFound('Stage instance not found on this case.');
  if (instance.status !== STAGE_INSTANCE_STATUS.ACTIVE) {
    throw conflict('This stage is no longer active. Reload the case to see the current stage.');
  }

  const caseRow = instance.case;
  if (caseRow.deletedAt) throw notFound('Case not found.');
  if (TERMINAL_STATUSES.includes(caseRow.status)) {
    throw conflict(`Case is ${caseRow.status.toLowerCase()} — no further stage actions are possible.`);
  }

  const stage = stages.find((s) => s.id === instance.stageId);
  if (!stage) throw notFound('Stage definition missing.');

  await assertCanAct(req, stage, caseRow);

  const outcome = stage.outcomes.find((o) => o.value === input.outcome);
  if (!outcome) throw badRequest(`"${input.outcome}" is not a valid outcome for stage ${stage.code}.`);

  const remarks = (input.remarks ?? '').trim();
  if (remarks.length < 5) throw badRequest('Remarks are required on every gate action (minimum 5 characters).');

  const mergedData = { ...parseJson<Record<string, any>>(instance.data, {}), ...(input.data ?? {}) };
  validateStageData(stage, mergedData, outcome);

  const decision = await prisma.decision.create({
    data: {
      stageInstanceId: instance.id,
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.roleName,
      outcome: outcome.value,
      outcomeLabel: outcome.label,
      kind: outcome.kind,
      remarks,
    },
  });

  const instanceStatus = {
    pass: STAGE_INSTANCE_STATUS.COMPLETED,
    return: STAGE_INSTANCE_STATUS.RETURNED,
    reject: STAGE_INSTANCE_STATUS.REJECTED,
    defer: STAGE_INSTANCE_STATUS.DEFERRED,
    lapse: STAGE_INSTANCE_STATUS.LAPSED,
  }[outcome.kind];

  await prisma.stageInstance.update({
    where: { id: instance.id },
    data: { status: instanceStatus, data: toJson(mergedData), completedAt: new Date() },
  });

  let refreshed = await prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } });
  if (outcome.kind === OUTCOME_KIND.PASS) {
    refreshed = await runStagePassEffects(refreshed, stage, mergedData, settings);
  }

  let result: { moved: string; stageId?: string; label: string };

  switch (outcome.kind) {
    case OUTCOME_KIND.PASS: {
      result = await moveForward(refreshed, stage, stages, mergedData, settings);
      break;
    }
    case OUTCOME_KIND.RETURN:
    case OUTCOME_KIND.DEFER: {
      result = await moveBackOrRepeat(refreshed, stage, stages, instance, outcome, settings);
      break;
    }
    case OUTCOME_KIND.REJECT: {
      await closeCase(refreshed, CASE_STATUS.REJECTED, remarks, stage);
      result = { moved: 'terminal', label: 'Case rejected' };
      break;
    }
    case OUTCOME_KIND.LAPSE: {
      await closeCase(refreshed, CASE_STATUS.LAPSED, remarks, stage);
      result = { moved: 'terminal', label: 'Case lapsed' };
      break;
    }
    default:
      throw badRequest(`Unsupported outcome kind "${outcome.kind}".`);
  }

  await audit(req, {
    action: 'STAGE_DECISION',
    entity: 'Case',
    entityId: caseRow.id,
    caseCode: caseRow.code,
    summary: `Stage ${stage.code} (${instance.roundLabel}) — ${outcome.label}`,
    before: { stageId: stage.id, status: caseRow.status },
    after: { outcome: outcome.value, kind: outcome.kind, next: result.stageId ?? null, remarks },
  });

  const finalCase = await prisma.case.findUniqueOrThrow({ where: { id: caseRow.id } });

  await notifyDecision(finalCase, stage, outcome, remarks);

  return { case: finalCase, decision, result };
}

async function moveForward(
  caseRow: any,
  stage: ParsedStage,
  stages: ParsedStage[],
  data: Record<string, any>,
  settings: Record<string, any>
) {
  // A named rule may redirect; otherwise walk the catalogue forward.
  let fromOrder = stage.order;
  let target: ParsedStage | null = null;

  if (stage.routing.rule === 'CABINET_TEST') {
    const test = evaluateCabinetTest(caseRow, settings, data);
    await prisma.case.update({
      where: { id: caseRow.id },
      data: { requiresCabinet: test.requiresCabinet, cabinetTestNote: test.note },
    });
    caseRow = { ...caseRow, requiresCabinet: test.requiresCabinet, cabinetTestNote: test.note };
  } else if (stage.routing.onPass && stage.routing.onPass !== 'NEXT') {
    target = stages.find((s) => s.id === stage.routing.onPass) ?? null;
    if (target) fromOrder = target.order - 1;
  }

  const next = target && isStageApplicable(target, caseRow, settings)
    ? target
    : nextApplicableStage(fromOrder, stages, caseRow, settings);

  if (!next) {
    await closeCase(caseRow, CASE_STATUS.COMPLETED, 'Final stage cleared.', stage);
    return { moved: 'completed' as const, label: 'Case completed' };
  }

  await startStageInstance(caseRow, next);
  return { moved: 'forward' as const, stageId: next.id, label: `${next.code} · ${next.name}` };
}

async function moveBackOrRepeat(
  caseRow: any,
  stage: ParsedStage,
  stages: ParsedStage[],
  instance: any,
  outcome: StageOutcome,
  settings: Record<string, any>
) {
  const targetId = outcome.to ?? stage.routing.onReturn ?? stage.id;
  const target = stages.find((s) => s.id === targetId);
  if (!target) throw badRequest(`Return target "${targetId}" is not a known stage.`);

  const isSameStage = target.id === stage.id;
  const nextRound = isSameStage ? instance.round + 1 : await nextRoundFor(caseRow.id, target.id);

  if (nextRound >= target.maxRounds) {
    throw conflict(
      `Stage ${target.code} allows ${target.maxRounds} round(s) (${target.roundLabels.join(', ')}) and they are exhausted. ` +
        'Record a final accept or reject instead.'
    );
  }

  await startStageInstance(caseRow, target, { round: nextRound });
  const label = target.roundLabels[nextRound] ?? `R${nextRound}`;
  return {
    moved: isSameStage ? ('repeat' as const) : ('back' as const),
    stageId: target.id,
    label: `${target.code} · ${target.name} (${label})`,
  };
}

async function nextRoundFor(caseId: string, stageId: string) {
  const last = await prisma.stageInstance.findFirst({
    where: { caseId, stageId },
    orderBy: { round: 'desc' },
    select: { round: true },
  });
  return last ? last.round + 1 : 0;
}

async function closeCase(caseRow: any, status: string, remarks: string, stage: ParsedStage) {
  await prisma.case.update({
    where: { id: caseRow.id },
    data: { status, closedAt: new Date(), slaDueAt: null },
  });
  await prisma.stageInstance.updateMany({
    where: { caseId: caseRow.id, status: STAGE_INSTANCE_STATUS.ACTIVE },
    data: { status: STAGE_INSTANCE_STATUS.COMPLETED, completedAt: new Date() },
  });

  if (status === CASE_STATUS.COMPLETED) {
    await prisma.complianceRecord.updateMany({ where: { caseId: caseRow.id }, data: { status: 'COMPLETED' } });
  }

  await notify({
    userIds: await investorUserIdsFor(caseRow.id),
    roleKeys: [ROLES.LANDS_OFFICER, ROLES.SUPER_ADMIN],
    type: `CASE_${status}`,
    title: `${caseRow.code} — ${status.toLowerCase()}`,
    message: `Closed at stage ${stage.code} · ${stage.name}. ${remarks}`,
    caseId: caseRow.id,
    link: `/cases/${caseRow.id}`,
  });
}

async function notifyDecision(caseRow: any, stage: ParsedStage, outcome: StageOutcome, remarks: string) {
  const investorIds = await investorUserIdsFor(caseRow.id);
  if (!investorIds.length) return;
  await notify({
    userIds: investorIds,
    type: 'GATE_DECISION',
    title: `${caseRow.code} — ${outcome.label}`,
    message: `Stage ${stage.code} · ${stage.name}: ${outcome.label}. ${remarks}`,
    caseId: caseRow.id,
    link: `/cases/${caseRow.id}`,
  });
}

// ---------------------------------------------------------------------------
// Permission & validation
// ---------------------------------------------------------------------------

export async function assertCanAct(req: Request, stage: ParsedStage, caseRow: any) {
  const user = req.user!;
  if (user.roleKey === ROLES.SUPER_ADMIN) return;
  if (user.roleKey === ROLES.VIEWER) throw forbidden('The Viewer / Auditor role is read-only.');

  const permission = await prisma.permission.findUnique({
    where: { roleKey_stageId: { roleKey: user.roleKey, stageId: stage.id } },
  });
  if (!permission?.canAct) {
    throw forbidden(`Your role (${user.roleName}) cannot act on stage ${stage.code} · ${stage.name}.`);
  }
  if (user.roleKey === ROLES.INVESTOR && !user.applicantIds.includes(caseRow.applicantId)) {
    throw forbidden('You can only act on your own cases.');
  }
}

export function validateStageData(stage: ParsedStage, data: Record<string, any>, outcome: StageOutcome) {
  // Required fields are only enforced on a forward move; a return or reject
  // must always be possible even with an incomplete form.
  if (outcome.kind !== OUTCOME_KIND.PASS) return;

  const missing = stage.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = data[f.key];
      if (f.type === 'boolean') return v !== true && v !== 'true';
      return v === undefined || v === null || String(v).trim() === '';
    })
    .map((f) => f.label);

  if (missing.length) {
    throw badRequest(`Complete the required stage fields before proceeding: ${missing.join(', ')}.`);
  }
}

// ---------------------------------------------------------------------------
// Side effects — the stage-specific writes onto the case and its child records
// ---------------------------------------------------------------------------

async function runStageStartEffects(caseRow: any, stage: ParsedStage, instance: any) {
  const settings = await getSettings();

  if (stage.type === 'ISSUANCE' && stage.id === 'S9') {
    const days = Number(settings.loi_validity_days ?? 90);
    const issued = new Date();
    await prisma.case.update({
      where: { id: caseRow.id },
      data: { loiIssuedAt: issued, loiValidUntil: addDays(issued, days) },
    });
    await prisma.stageInstance.update({
      where: { id: instance.id },
      data: {
        data: toJson({
          ...parseJson<Record<string, any>>(instance.data, {}),
          loiIssuedOn: issued.toISOString().slice(0, 10),
          validityDays: days,
        }),
      },
    });
  }

  if (stage.type === 'FINANCIAL') {
    await ensurePaymentSchedule(caseRow.id);
  }

  if (stage.type === 'MONITORING') {
    await prisma.complianceRecord.upsert({
      where: { caseId: caseRow.id },
      create: {
        caseId: caseRow.id,
        commencementDeadline: caseRow.commencementDeadline,
        status: 'PENDING',
      },
      update: { commencementDeadline: caseRow.commencementDeadline },
    });
  }
}

async function runStagePassEffects(
  caseRow: any,
  stage: ParsedStage,
  data: Record<string, any>,
  settings: Record<string, any>
) {
  const update: Record<string, any> = {};

  if (data.modeOfAllotment) update.mode = data.modeOfAllotment;
  if (data.holdingType) update.holdingType = data.holdingType;
  if (data.goNumber) update.goNumber = String(data.goNumber);
  if (data.goDate) update.goDate = new Date(data.goDate);
  if (data.acceptedOn) update.loiAcceptedAt = new Date(data.acceptedOn);
  if (data.possessionDate) update.possessionDate = new Date(data.possessionDate);
  if (data.registrationDate) update.registrationDate = new Date(data.registrationDate);

  if (data.extentAcres !== undefined && data.extentAcres !== '') {
    update.extentAcres = Number(data.extentAcres);
  } else if (data.approvedExtent !== undefined && data.approvedExtent !== '') {
    update.extentAcres = Number(data.approvedExtent);
  }

  if (stage.type === 'ISSUANCE' && stage.id === 'S9' && !data.acceptedOn) {
    update.loiAcceptedAt = new Date();
  }

  if (stage.type === 'LEGAL' && data.agreementDate) {
    const agreement = new Date(data.agreementDate);
    const years = Number(settings.commencement_deadline_years ?? 2);
    update.agreementDate = agreement;
    update.commencementDeadline = new Date(
      new Date(agreement).setFullYear(agreement.getFullYear() + years)
    );
  }

  const updated = Object.keys(update).length
    ? await prisma.case.update({ where: { id: caseRow.id }, data: update })
    : caseRow;

  if (stage.type === 'LEGAL') {
    await recordLegalCharges(updated, data);
  }

  if (stage.type === 'APPROVAL' && stage.id === 'S13') {
    await prisma.buildingPermission.upsert({
      where: { caseId: updated.id },
      create: {
        caseId: updated.id,
        applicationNo: String(data.permissionApplicationNo ?? ''),
        proposedFsi: Number(data.proposedFsi ?? 0),
        proposedFar: Number(data.proposedFar ?? 0),
        builtUpArea: Number(data.builtUpArea ?? 0),
        layoutApproved: data.layoutApproved === true || data.layoutApproved === 'true',
        status: 'SANCTIONED',
        sanctionedAt: data.sanctionDate ? new Date(data.sanctionDate) : new Date(),
        remarks: String(data.sanctionNo ?? ''),
      },
      update: {
        applicationNo: String(data.permissionApplicationNo ?? ''),
        proposedFsi: Number(data.proposedFsi ?? 0),
        proposedFar: Number(data.proposedFar ?? 0),
        builtUpArea: Number(data.builtUpArea ?? 0),
        layoutApproved: data.layoutApproved === true || data.layoutApproved === 'true',
        status: 'SANCTIONED',
        sanctionedAt: data.sanctionDate ? new Date(data.sanctionDate) : new Date(),
      },
    });
  }

  if (stage.type === 'MONITORING' && data.commencementDate) {
    await prisma.complianceRecord.upsert({
      where: { caseId: updated.id },
      create: {
        caseId: updated.id,
        commencementDeadline: updated.commencementDeadline,
        commencedAt: new Date(data.commencementDate),
        status: 'GOOD_STANDING',
      },
      update: { commencedAt: new Date(data.commencementDate), status: 'GOOD_STANDING' },
    });
  }

  if (stage.type === 'COMPLIANCE') {
    await prisma.complianceRecord.upsert({
      where: { caseId: updated.id },
      create: {
        caseId: updated.id,
        commencementDeadline: data.commencementDeadline ? new Date(data.commencementDeadline) : updated.commencementDeadline,
        status: String(data.complianceStatus ?? 'GOOD_STANDING'),
        note: `Utilisation ${data.utilisationPct ?? 0}%`,
      },
      update: {
        status: String(data.complianceStatus ?? 'GOOD_STANDING'),
        note: `Utilisation ${data.utilisationPct ?? 0}%`,
      },
    });
  }

  return updated;
}

async function recordLegalCharges(caseRow: any, data: Record<string, any>) {
  const rows: { type: string; label: string; amount: number }[] = [];
  if (Number(data.stampDuty) > 0) rows.push({ type: 'STAMP_DUTY', label: 'Stamp duty', amount: Number(data.stampDuty) });
  if (Number(data.registrationCharges) > 0) {
    rows.push({ type: 'REGISTRATION_CHARGE', label: 'Registration charges', amount: Number(data.registrationCharges) });
  }
  for (const row of rows) {
    const exists = await prisma.payment.findFirst({ where: { caseId: caseRow.id, type: row.type } });
    if (exists) continue;
    await prisma.payment.create({
      data: {
        caseId: caseRow.id,
        type: row.type,
        label: row.label,
        amount: row.amount,
        dueDate: caseRow.agreementDate ?? new Date(),
        status: 'PENDING',
      },
    });
  }
}

/** Builds a down-payment + instalment schedule the first time Stage 10 opens. */
export async function ensurePaymentSchedule(caseId: string) {
  const settings = await getSettings();
  const existing = await prisma.payment.count({
    where: { caseId, type: { in: ['DOWN_PAYMENT', 'INSTALMENT'] } },
  });
  if (existing > 0) return;

  const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { plot: true } });
  const perAcre = caseRow.plot?.reservePrice ?? 0;
  const total = Math.round(perAcre * (caseRow.extentAcres || caseRow.plot?.extentAcres || 0));
  if (total <= 0) return;

  const downPct = Number(settings.default_down_payment_pct ?? 25);
  const instalments = Number(settings.default_instalments ?? 4);
  const gapDays = Number(settings.instalment_gap_days ?? 90);

  const down = Math.round((total * downPct) / 100);
  const remainder = total - down;
  const each = Math.round(remainder / Math.max(1, instalments));

  const start = new Date();
  const rows = [
    {
      caseId,
      type: 'DOWN_PAYMENT',
      label: `Down payment (${downPct}%)`,
      amount: down,
      dueDate: addDays(start, 30),
      status: 'PENDING',
    },
    ...Array.from({ length: instalments }, (_, i) => ({
      caseId,
      type: 'INSTALMENT',
      label: `Instalment ${i + 1} of ${instalments}`,
      amount: i === instalments - 1 ? remainder - each * (instalments - 1) : each,
      dueDate: addDays(start, 30 + gapDays * (i + 1)),
      status: 'PENDING',
    })),
  ];

  await prisma.payment.createMany({ data: rows });
}
