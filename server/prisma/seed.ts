/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/lib/env';
import { hashPassword } from '../src/lib/auth';
import { toJson } from '../src/lib/json';
import { CAPABILITIES, PERMIT_DOCUMENT_TYPES, ROLES } from '../src/lib/enums';
import { STAGE_CATALOGUE, type StageDef } from '../src/workflow/catalogue';
import { ROLE_SEED, SETTINGS_SEED, PERMISSION_MATRIX } from './seed-data';
import { CASE_SPECS, PLOT_SEED, USER_SEED, APPLICANT_SEED } from './seed-cases';

const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * DAY);
const daysAhead = (d: number) => new Date(now + d * DAY);

async function main() {
  console.log('› Clearing existing data…');
  await wipe();

  console.log('› Seeding roles, stages, permissions, settings…');
  await seedRoles();
  await seedStages();
  await seedPermissions();
  await seedSettings();

  console.log('› Seeding users…');
  const users = await seedUsers();

  console.log('› Seeding land inventory & invitations…');
  const plots = await seedPlots();
  await seedInvitations(plots);

  console.log('› Seeding applicants…');
  const applicants = await seedApplicants(users);

  console.log('› Building placeholder documents…');
  const placeholderUrl = await writePlaceholderPdf();

  console.log('› Walking cases through the workflow…');
  const summary = await seedCases({ users, plots, applicants, placeholderUrl });

  console.log('\n  Seed complete.');
  console.log(`  ${summary.cases} cases · ${summary.decisions} decisions · ${summary.payments} payment lines`);
  console.log(`  ${await prisma.grievance.count()} grievances · ${await prisma.cancellation.count()} cancellation requests`);
  console.log(`  ${await prisma.auditLog.count()} audit entries · ${await prisma.notification.count()} notifications\n`);
  console.log('  Sign in at http://localhost:5173 — admin@apcrda.demo / Admin@123');
  console.log('  Demo credentials — change before production.\n');
}

async function wipe() {
  // Order matters: children before parents.
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.stageInstance.deleteMany();
  await prisma.document.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.grievance.deleteMany();
  await prisma.cancellation.deleteMany();
  await prisma.constructionMilestone.deleteMany();
  await prisma.complianceRecord.deleteMany();
  await prisma.buildingPermission.deleteMany();
  await prisma.caseComment.deleteMany();
  await prisma.case.deleteMany();
  await prisma.applicant.deleteMany();
  await prisma.invitationPlot.deleteMany();
  await prisma.invitationDocument.deleteMany();
  await prisma.plot.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.setting.deleteMany();
}

// ---------------------------------------------------------------------------

async function seedRoles() {
  await prisma.role.createMany({
    data: ROLE_SEED.map((role, i) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      capabilities: toJson(role.capabilities),
      sortOrder: i,
    })),
  });
}

async function seedStages() {
  await prisma.stage.createMany({
    data: STAGE_CATALOGUE.map((stage) => ({
      id: stage.id,
      code: stage.code,
      name: stage.name,
      order: stage.order,
      phase: stage.phase,
      type: stage.type,
      ownerRoleKey: stage.ownerRoleKey,
      coOwnerRole: stage.coOwnerRole ?? null,
      slaDays: stage.slaDays,
      maxRounds: stage.maxRounds,
      roundLabels: toJson(stage.roundLabels),
      outcomes: toJson(stage.outcomes),
      fields: toJson(stage.fields),
      docTypes: toJson(stage.docTypes),
      routing: toJson(stage.routing),
      optional: stage.optional ?? false,
      enabled: true,
      description: stage.description,
    })),
  });
}

async function seedPermissions() {
  const rows = STAGE_CATALOGUE.flatMap((stage) =>
    ROLE_SEED.map((role) => {
      const matrix = PERMISSION_MATRIX[role.key] ?? { act: [], view: 'ALL' as const };
      const canAct = role.key === ROLES.SUPER_ADMIN || matrix.act.includes(stage.id);
      const canView =
        role.key === ROLES.INVESTOR
          ? true // scoped to their own cases elsewhere
          : matrix.view === 'ALL' || canAct || (matrix.view as string[]).includes(stage.id);
      return { roleKey: role.key, stageId: stage.id, canAct, canView };
    })
  );
  await prisma.permission.createMany({ data: rows });
}

async function seedSettings() {
  await prisma.setting.createMany({
    data: SETTINGS_SEED.map((s) => ({
      key: s.key,
      value: typeof s.value === 'string' ? s.value : toJson(s.value),
      group: s.group,
      label: s.label,
      type: s.type,
      help: s.help ?? '',
    })),
  });
}

async function seedUsers() {
  const map: Record<string, any> = {};
  for (const u of USER_SEED) {
    const created = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: await hashPassword(u.password),
        roleKey: u.roleKey,
        wing: u.wing ?? null,
        committee: u.committee ?? null,
        designation: u.designation ?? null,
        phone: u.phone ?? null,
        lastLoginAt: daysAgo(Math.floor(Math.random() * 9) + 1),
      },
    });
    map[u.email] = created;
  }
  return map;
}

async function seedPlots() {
  // `key` is the short handle the rest of the seed wires by ("KC-01"); the code
  // that goes on the record is the Amaravati LPS plot number.
  const byCode = new Map(PLOT_SEED.map((p) => [p.code, p.key]));
  await prisma.plot.createMany({ data: PLOT_SEED.map(({ key, ...plot }) => plot) as any });
  const rows = await prisma.plot.findMany();
  return Object.fromEntries(rows.map((p) => [byCode.get(p.code) ?? p.code, p])) as Record<string, any>;
}

async function seedInvitations(plots: Record<string, any>) {
  const sets = [
    {
      code: 'APCRDA/ID/2024/01',
      title: 'Invitation for allotment — Knowledge & Electronics City parcels',
      mode: 'QUALITY_CUM_PRICE',
      terms:
        'Allotment on 99-year lease. Minimum investment ₹250 Cr. Construction to commence within 24 months of agreement. EMD 2% of reserve value.',
      status: 'PUBLISHED',
      publishedAt: daysAgo(420),
      plotKeys: ['KC-01', 'KC-02', 'EC-01'],
    },
    {
      code: 'APCRDA/ID/2024/02',
      title: 'Invitation for allotment — Health & Sports City parcels',
      mode: 'QUALITY_BASED',
      terms: 'Institutional allotment. Utilisation certificate required annually. Freehold not permitted.',
      status: 'PUBLISHED',
      publishedAt: daysAgo(300),
      plotKeys: ['HC-01', 'SC-01'],
    },
    {
      code: 'APCRDA/ID/2025/01',
      title: 'Invitation for allotment — Financial District & Media City',
      mode: 'PUBLIC_AUCTION',
      terms: 'e-Auction on the APCRDA portal. Reserve price as notified. Down payment 25% within 30 days of LOI.',
      status: 'PUBLISHED',
      publishedAt: daysAgo(120),
      plotKeys: ['FC-01', 'FC-02', 'MC-01'],
    },
    {
      code: 'APCRDA/ID/2025/02',
      title: 'Invitation for allotment — Justice & Tourism City parcels',
      mode: 'NOMINATION',
      terms: 'Reserved for Government and statutory bodies. Concessional pricing subject to Cabinet approval.',
      status: 'DRAFT',
      plotKeys: ['JC-01', 'TC-01'],
    },
  ];

  for (const set of sets) {
    await prisma.invitationDocument.create({
      data: {
        code: set.code,
        title: set.title,
        terms: set.terms,
        mode: set.mode,
        status: set.status,
        publishedAt: set.publishedAt ?? null,
        closesAt: set.publishedAt ? new Date(set.publishedAt.getTime() + 60 * DAY) : null,
        plots: { create: set.plotKeys.filter((c) => plots[c]).map((c) => ({ plotId: plots[c].id })) },
      },
    });
  }
}

async function seedApplicants(users: Record<string, any>) {
  const map: Record<string, any> = {};
  for (const a of APPLICANT_SEED) {
    map[a.key] = await prisma.applicant.create({
      data: {
        entityType: a.entityType,
        name: a.name,
        promoterProfile: a.promoterProfile,
        netWorth: a.netWorth,
        pan: a.pan,
        cin: a.cin,
        contactEmail: a.contactEmail,
        contactPhone: a.contactPhone,
        address: a.address,
        contactUserId: a.contactUserEmail ? users[a.contactUserEmail]?.id ?? null : null,
      },
    });
  }
  return map;
}

/** One real PDF on disk so seeded document downloads actually work. */
async function writePlaceholderPdf() {
  const dir = path.join(env.uploadDir, 'samples');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'placeholder.pdf');

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);
    doc.fillColor('#0f2d52').fontSize(20).text('APCRDA — Amaravati Land Allotment Portal');
    doc.moveDown(0.5).fillColor('#5b6b82').fontSize(11).text('Placeholder document');
    doc.moveDown(1).fillColor('#1f2937').fontSize(10);
    doc.text(
      'This file stands in for a real uploaded document in the seeded demo data. Every seeded ' +
        'document row (DPRs, minutes, GOs, LOIs, certificates and so on) points at this file so that ' +
        'the Documents tab, versioning, and download behaviour can be exercised end to end.'
    );
    doc.moveDown(1).fillColor('#8a94a6').fontSize(9).text(`Generated ${new Date().toISOString()}`);
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return '/uploads/samples/placeholder.pdf';
}

// ---------------------------------------------------------------------------
// The case walker
// ---------------------------------------------------------------------------

type WalkCtx = {
  users: Record<string, any>;
  plots: Record<string, any>;
  applicants: Record<string, any>;
  placeholderUrl: string;
};

const stageById = Object.fromEntries(STAGE_CATALOGUE.map((s) => [s.id, s])) as Record<string, StageDef>;

/**
 * Rows whose generated ids nothing else refers to are queued here and inserted
 * with createMany. On a local SQLite file the difference is invisible; against a
 * remote database it is the difference between ~1,800 round trips and a few
 * dozen, which is what makes seeding a hosted database practical.
 */
const pending = {
  documents: [] as any[],
  audit: [] as any[],
  payments: [] as any[],
  milestones: [] as any[],
  notifications: [] as any[],
  comments: [] as any[],
};

/** Document versions, tracked in memory so no findFirst is needed per upload. */
const docVersions = new Map<string, number>();

async function flushPending() {
  const batches: [string, any[]][] = [
    ['document', pending.documents],
    ['auditLog', pending.audit],
    ['payment', pending.payments],
    ['constructionMilestone', pending.milestones],
    ['notification', pending.notifications],
    ['caseComment', pending.comments],
  ];
  for (const [model, rows] of batches) {
    if (!rows.length) continue;
    // Chunked: a single statement with thousands of rows can exceed parameter limits.
    for (let i = 0; i < rows.length; i += 500) {
      await (prisma as any)[model].createMany({ data: rows.slice(i, i + 500) });
    }
    rows.length = 0;
  }
}

/** Mirrors engine.isStageApplicable so the seeded timeline matches live routing. */
function applicable(stage: StageDef, c: any) {
  if (!stage.optional) return true;
  if (stage.routing.applicability === 'CABINET_REQUIRED') return c.requiresCabinet === true;
  if (stage.routing.applicability === 'SUBCOMMITTEE_REQUIRED') {
    return c.isConcessional === true || c.mode === 'NOMINATION';
  }
  return true;
}

async function seedCases(ctx: WalkCtx) {
  let decisions = 0;
  let payments = 0;

  for (const [index, spec] of CASE_SPECS.entries()) {
    const plot = spec.plotKey ? ctx.plots[spec.plotKey] : null;
    const applicant = ctx.applicants[spec.applicantKey];

    const code = `APCRDA/LA/${spec.year}/${String(index + 1).padStart(4, '0')}`;
    const createdAt = daysAgo(spec.startedDaysAgo);

    let caseRow = await prisma.case.create({
      data: {
        code,
        title: spec.title,
        applicantId: applicant.id,
        plotId: plot?.id ?? null,
        mode: spec.mode,
        objectiveCategory: spec.objectiveCategory,
        sector: spec.sector,
        investmentAmount: spec.investmentAmount,
        jobsCommitted: spec.jobsCommitted,
        extentAcres: spec.extentAcres ?? plot?.extentAcres ?? 0,
        holdingType: spec.holdingType,
        isConcessional: spec.isConcessional ?? false,
        landCategory: plot?.landCategory ?? 'NORMAL',
        status: 'IN_PROGRESS',
        assigneeId: ctx.users['lands@apcrda.demo'].id,
        createdAt,
        updatedAt: createdAt,
      },
    });

    if (plot) {
      await prisma.plot.update({
        where: { id: plot.id },
        data: { availability: spec.terminal === 'CANCELLED' ? 'AVAILABLE' : spec.plotStatus ?? 'ALLOTTED' },
      });
    }

    // Walk the catalogue. Space the steps so the whole history fits inside
    // `startedDaysAgo` and the case still lands a little short of today.
    let cursor = createdAt.getTime();
    const steps =
      STAGE_CATALOGUE.filter((s) => s.order <= stageById[spec.stopAt].order && applicable(s, caseRow)).length +
      Object.values(spec.rounds ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
    const gap = Math.max(1, Math.floor((spec.startedDaysAgo * 0.85) / Math.max(1, steps)));

    for (const stage of STAGE_CATALOGUE) {
      if (stage.order > stageById[spec.stopAt].order) break;
      if (!applicable(stage, caseRow)) continue;

      const isFinalStage = stage.id === spec.stopAt;
      const rounds = spec.rounds?.[stage.id] ?? 0; // extra returns before the pass

      for (let round = 0; round <= rounds; round += 1) {
        const isLastRound = round === rounds;
        // Never let a stage open in the future — an active stage must have a
        // positive age, and a closed one must close before today.
        const startedAt = new Date(Math.min(cursor, now - 2 * DAY));
        cursor = startedAt.getTime() + gap * DAY;
        const completedAt = new Date(Math.min(cursor, now - DAY));

        // The case rests on its final stage: leave it ACTIVE unless it is terminal.
        if (isFinalStage && isLastRound && !spec.terminal) {
          await prisma.stageInstance.create({
            data: {
              caseId: caseRow.id,
              stageId: stage.id,
              round,
              roundLabel: stage.roundLabels[Math.min(round, stage.roundLabels.length - 1)],
              status: 'ACTIVE',
              ownerRoleKey: stage.ownerRoleKey,
              data: toJson(spec.partialData?.[stage.id] ?? {}),
              dueAt: spec.overdue ? daysAgo(spec.overdueBy ?? 9) : daysAhead(stage.slaDays - 2),
              startedAt,
            },
          });
          caseRow = await prisma.case.update({
            where: { id: caseRow.id },
            data: {
              currentStageId: stage.id,
              phase: stage.phase,
              slaDueAt: spec.overdue ? daysAgo(spec.overdueBy ?? 9) : daysAhead(stage.slaDays - 2),
              updatedAt: startedAt,
            },
          });
          break;
        }

        const outcome = pickOutcome(stage, {
          isLastRound,
          isFinalStage,
          terminal: isFinalStage ? spec.terminal : undefined,
        });

        const data = { ...stageData(stage, caseRow, spec, ctx), ...(spec.partialData?.[stage.id] ?? {}) };

        const instance = await prisma.stageInstance.create({
          data: {
            caseId: caseRow.id,
            stageId: stage.id,
            round,
            roundLabel: stage.roundLabels[Math.min(round, stage.roundLabels.length - 1)],
            status:
              outcome.kind === 'pass'
                ? 'COMPLETED'
                : outcome.kind === 'return'
                  ? 'RETURNED'
                  : outcome.kind === 'defer'
                    ? 'DEFERRED'
                    : outcome.kind === 'lapse'
                      ? 'LAPSED'
                      : 'REJECTED',
            ownerRoleKey: stage.ownerRoleKey,
            data: toJson(data),
            dueAt: new Date(startedAt.getTime() + stage.slaDays * DAY),
            startedAt,
            completedAt,
          },
        });

        const actor = actorFor(stage, ctx);
        await prisma.decision.create({
          data: {
            stageInstanceId: instance.id,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: roleName(stage.ownerRoleKey),
            outcome: outcome.value,
            outcomeLabel: outcome.label,
            kind: outcome.kind,
            remarks: remarkFor(stage, outcome.kind, round),
            createdAt: completedAt,
          },
        });
        decisions += 1;

        pending.audit.push({
            actorId: actor.id,
            actorName: actor.name,
            actorRole: roleName(stage.ownerRoleKey),
            action: 'STAGE_DECISION',
            entity: 'Case',
            entityId: caseRow.id,
            caseCode: caseRow.code,
            summary: `Stage ${stage.code} (${instance.roundLabel}) — ${outcome.label}`,
            createdAt: completedAt,
        });

        caseRow = await applyCaseEffects(caseRow, stage, data, completedAt);
        seedStageDocuments(caseRow, stage, ctx, completedAt);

        // A return/defer opens the next round; only a terminal outcome stops the walk.
        if (outcome.kind === 'reject' || outcome.kind === 'lapse') break;
      }
    }

    // Terminal states.
    if (spec.terminal) {
      const closedAt = new Date(Math.min(cursor, now - DAY));
      caseRow = await prisma.case.update({
        where: { id: caseRow.id },
        data: { status: spec.terminal, closedAt, slaDueAt: null, currentStageId: spec.stopAt, phase: stageById[spec.stopAt].phase },
      });
    }

    payments += await seedFinancials(caseRow, spec, ctx);
    await seedExtras(caseRow, spec, ctx);
  }

  await flushPending();
  return { cases: CASE_SPECS.length, decisions, payments };
}

function pickOutcome(stage: StageDef, opts: { isLastRound: boolean; isFinalStage: boolean; terminal?: string }) {
  if (opts.isFinalStage && opts.terminal) {
    const wanted =
      opts.terminal === 'LAPSED'
        ? 'lapse'
        : opts.terminal === 'REJECTED'
          ? 'reject'
          : 'pass';
    const match = stage.outcomes.find((o) => o.kind === wanted);
    if (match) return match;
  }
  if (!opts.isLastRound) {
    const back = stage.outcomes.find((o) => o.kind === 'return' || o.kind === 'defer');
    if (back) return back;
  }
  return stage.outcomes.find((o) => o.kind === 'pass') ?? stage.outcomes[0];
}

function roleName(key: string) {
  return ROLE_SEED.find((r) => r.key === key)?.name ?? key;
}

function actorFor(stage: StageDef, ctx: WalkCtx) {
  const email = USER_SEED.find((u) => u.roleKey === stage.ownerRoleKey)?.email ?? 'admin@apcrda.demo';
  return ctx.users[email];
}

function remarkFor(stage: StageDef, kind: string, round: number) {
  const map: Record<string, string[]> = {
    pass: [
      `Stage ${stage.code} examined and found in order. Cleared for the next stage.`,
      `Documentation complete and consistent with the invitation terms. Recommended to proceed.`,
      `No adverse observations. Approved subject to the conditions already on record.`,
    ],
    return: [
      `Returned for revision (round ${round + 1}): the submission omits key particulars called for at this stage.`,
      `Clarifications sought on phasing and cost assumptions before this stage can be cleared.`,
    ],
    defer: [`Deferred to the next sitting; the item could not be taken up for want of time.`],
    reject: [`Rejected. The proposal does not meet the eligibility and scrutiny requirements on record.`],
    lapse: [`Marked lapsed — the validity window closed without acceptance from the allottee.`],
  };
  const options = map[kind] ?? map.pass;
  return options[(stage.order + round) % options.length];
}

/** Plausible values for each stage's form. */
function stageData(stage: StageDef, c: any, spec: any, ctx: WalkCtx): Record<string, any> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const perAcre = ctx.plots[spec.plotKey]?.reservePrice ?? 40_000_000;

  switch (stage.id) {
    case 'S0':
      return { invitationRef: spec.invitationRef ?? 'APCRDA/ID/2024/01', plotsPublished: 3, mode: c.mode, termsSummary: 'Published under the standing allotment policy.', publishedOn: iso(daysAgo(spec.startedDaysAgo + 20)) };
    case 'S1':
      return {
        applicationRef: `APP/${c.code.slice(-4)}`,
        processingFee: 250_000,
        emdAmount: Math.round(perAcre * c.extentAcres * 0.02),
        emdReference: `UTR${Math.floor(Math.random() * 900000000 + 100000000)}`,
        declarationSigned: true,
      };
    case 'S1A':
      return { entityTypeEligible: true, netWorthVerified: true, emdVerified: true, modeOfAllotment: c.mode, eligibilityNotes: 'Entity type, net worth and EMD verified against the invitation terms.' };
    case 'S2':
      return { dprVersion: 'v1.2', projectCost: spec.investmentAmount, builtUpArea: Math.round(c.extentAcres * 43_560 * 1.4), phasingPlan: 'Phase I 60% in 24 months; Phase II balance in 36 months.', technicalScore: 74 + (stage.order % 12), reviewNotes: 'Layout, parking and services conform to the zonal regulations.' };
    case 'S3':
      return { investmentQuantum: spec.investmentAmount, directJobs: spec.jobsCommitted, indirectJobs: Math.round(spec.jobsCommitted * 1.8), sectorPriority: 'High', economicScore: 78, assessment: 'Investment and employment commitments are consistent with the sector priority for the theme city.' };
    case 'S4':
      return { meetingNo: `LASC/${2024 + (stage.order % 2)}/${10 + stage.order}`, meetingDate: iso(daysAgo(Math.max(5, spec.startedDaysAgo - 120))), siteVerified: true, titleVerified: true, encumbrance: 'Nil encumbrance; EC obtained for 30 years.', recommendedExtent: c.extentAcres, recommendedPrice: perAcre, recommendation: 'Committee recommends allotment on the terms placed before it.' };
    case 'S5':
      return { gomMeetingNo: `GoM/${2024 + (stage.order % 2)}/${5 + stage.order}`, gomDate: iso(daysAgo(Math.max(4, spec.startedDaysAgo - 160))), concessionsApproved: !!c.isConcessional, priceApproved: perAcre, gomNotes: 'Group of Ministers cleared the proposal as recommended by LASC.' };
    case 'S5A':
      return { subCommitteeRef: `CSC/${2025}/${stage.order}`, meetingDate: iso(daysAgo(Math.max(3, spec.startedDaysAgo - 180))), recommendation: 'Sub-Committee endorses the concessional terms proposed.' };
    case 'S6':
      return { authorityMeetingNo: `AUTH/${2025}/${20 + stage.order}`, resolutionNo: `RES-${100 + stage.order}`, approvalDate: iso(daysAgo(Math.max(3, spec.startedDaysAgo - 200))), approvedExtent: c.extentAcres, approvedPrice: perAcre, conditions: 'Subject to payment of consideration and commencement within 24 months.' };
    case 'S6A':
      return { overrideToCabinet: false, testNotes: 'Cabinet-approval test applied to extent, concession status and land category.' };
    case 'S7':
      return { cabinetMeetingNo: `CAB/${2025}/${8 + stage.order}`, cabinetDate: iso(daysAgo(Math.max(3, spec.startedDaysAgo - 220))), decisionNo: `CD-${200 + stage.order}`, conditions: 'Approved as recommended by the Authority.' };
    case 'S8':
      return { goNumber: `G.O.Ms.No.${60 + stage.order}`, goDate: iso(daysAgo(Math.max(3, spec.startedDaysAgo - 240))), extentAcres: c.extentAcres, holdingType: c.holdingType, landUse: ctx.plots[spec.plotKey]?.landUse ?? 'Commercial', tenureYears: c.holdingType === 'LEASEHOLD' ? 99 : 0, landDetails: 'Boundaries as per the approved layout and the survey sketch annexed to the order.' };
    case 'S9':
      return { loiNumber: `LOI/${c.code.slice(-4)}`, loiIssuedOn: iso(daysAgo(Math.max(2, spec.startedDaysAgo - 260))), validityDays: 90, acceptedOn: iso(daysAgo(Math.max(1, spec.startedDaysAgo - 280))), acceptanceRef: `ACC/${c.code.slice(-4)}` };
    case 'S10':
      return { totalConsideration: Math.round(perAcre * c.extentAcres), downPaymentPct: 25, instalments: 4, scheduleNotes: 'Down payment within 30 days of LOI acceptance; four quarterly instalments thereafter.' };
    case 'S11':
      return { finalDprVersion: 'v2.0', finalProjectCost: Math.round(spec.investmentAmount * 1.05), finalBuiltUpArea: Math.round(c.extentAcres * 43_560 * 1.45), deviations: 'Minor changes to the internal circulation; overall FSI unchanged.' };
    case 'S12': {
      const agreement = daysAgo(Math.max(2, spec.agreementDaysAgo ?? spec.startedDaysAgo - 320));
      return { agreementRef: `AGR/${c.code.slice(-4)}`, agreementDate: iso(agreement), subRegistrarOffice: 'Sub-Registrar, Thullur', registrationNo: `REG-${4000 + stage.order}`, registrationDate: iso(new Date(agreement.getTime() + 5 * DAY)), stampDuty: Math.round(perAcre * c.extentAcres * 0.05), registrationCharges: Math.round(perAcre * c.extentAcres * 0.01) };
    }
    case 'S12A':
      return { possessionDate: iso(daysAgo(Math.max(2, (spec.agreementDaysAgo ?? spec.startedDaysAgo - 320) - 20))), boundariesDemarcated: true, handoverRef: `POS/${c.code.slice(-4)}`, siteNotes: 'Plot handed over after joint measurement with the allottee.' };
    case 'S13':
      return { permissionApplicationNo: `BP/${c.code.slice(-4)}`, proposedFsi: ctx.plots[spec.plotKey]?.fsi ?? 3, proposedFar: ctx.plots[spec.plotKey]?.far ?? 3, builtUpArea: Math.round(c.extentAcres * 43_560 * 1.4), layoutApproved: true, nocsCleared: true, sanctionNo: `BPS-${700 + stage.order}`, sanctionDate: iso(daysAgo(Math.max(2, spec.startedDaysAgo - 400))) };
    case 'S14':
      return { commencementDate: spec.commenced === false ? '' : iso(daysAgo(Math.max(2, spec.startedDaysAgo - 430))), overallProgressPct: spec.progressPct ?? 45, lastInspection: iso(daysAgo(21)), delaysNoted: spec.progressPct && spec.progressPct < 30 ? 'Progress behind the approved milestone plan.' : 'On schedule against the approved milestones.' };
    case 'S15':
      return { commencementDeadline: iso(daysAhead(spec.commencementInDays ?? 120)), utilisationPct: spec.utilisationPct ?? 92, completionCertNo: `CC-${900 + stage.order}`, completionDate: iso(daysAgo(20)), complianceStatus: spec.complianceStatus ?? 'GOOD_STANDING' };
    default:
      return {};
  }
}

/** Same writes the live engine performs on a pass. */
async function applyCaseEffects(caseRow: any, stage: StageDef, data: Record<string, any>, at: Date) {
  const update: Record<string, any> = { updatedAt: at, currentStageId: stage.id, phase: stage.phase };

  if (data.modeOfAllotment) update.mode = data.modeOfAllotment;
  if (data.goNumber) update.goNumber = data.goNumber;
  if (data.goDate) update.goDate = new Date(data.goDate);
  if (data.holdingType) update.holdingType = data.holdingType;
  if (data.possessionDate) update.possessionDate = new Date(data.possessionDate);
  if (data.registrationDate) update.registrationDate = new Date(data.registrationDate);

  if (stage.id === 'S6A') {
    const requiresCabinet =
      caseRow.extentAcres >= 25 || caseRow.isConcessional === true || caseRow.landCategory === 'SENSITIVE';
    update.requiresCabinet = requiresCabinet;
    update.cabinetTestNote = requiresCabinet
      ? `Routed to Cabinet: ${[
          caseRow.extentAcres >= 25 ? `extent ${caseRow.extentAcres} ac ≥ threshold 25 ac` : null,
          caseRow.isConcessional ? 'allotment is concessional' : null,
          caseRow.landCategory === 'SENSITIVE' ? 'land category is SENSITIVE' : null,
        ]
          .filter(Boolean)
          .join('; ')}.`
      : 'No Cabinet trigger met — routed directly to Government Order.';
  }

  if (stage.id === 'S9') {
    const issued = new Date(data.loiIssuedOn);
    update.loiIssuedAt = issued;
    update.loiValidUntil = new Date(issued.getTime() + Number(data.validityDays ?? 90) * DAY);
    if (data.acceptedOn) update.loiAcceptedAt = new Date(data.acceptedOn);
  }

  if (stage.id === 'S12' && data.agreementDate) {
    const agreement = new Date(data.agreementDate);
    update.agreementDate = agreement;
    update.commencementDeadline = new Date(new Date(agreement).setFullYear(agreement.getFullYear() + 2));
  }

  return prisma.case.update({ where: { id: caseRow.id }, data: update });
}

function seedStageDocuments(caseRow: any, stage: StageDef, ctx: WalkCtx, at: Date) {
  const types = stage.docTypes.filter((t) => t !== 'Other').slice(0, 2);
  for (const type of types) {
    const versionKey = `${caseRow.id}:${type}`;
    const version = (docVersions.get(versionKey) ?? 0) + 1;
    docVersions.set(versionKey, version);
    pending.documents.push({
        caseId: caseRow.id,
        stageId: stage.id,
        type,
        name: `${type.replace(/[^\w]+/g, '-')}-${caseRow.code.slice(-4)}.pdf`,
        version,
        fileUrl: ctx.placeholderUrl,
        mimeType: 'application/pdf',
        size: 18_432,
        visibility: stage.ownerRoleKey === ROLES.INVESTOR || stage.coOwnerRole === ROLES.INVESTOR ? 'INVESTOR' : 'INTERNAL',
        uploadedById: actorFor(stage, ctx).id,
        uploadedAt: at,
    });
  }
}

/**
 * The papers a permit file actually holds — plans, drawings, the BIM model, the
 * NOCs, and (once granted) the permission order. Types the stage walk already
 * filed are left alone so versions stay honest.
 */
function seedPermitDocuments(caseRow: any, ctx: WalkCtx, at: Date, sanctioned: boolean) {
  const already = new Set(pending.documents.filter((d) => d.caseId === caseRow.id).map((d) => d.type));
  const extension: Record<string, [string, string]> = {
    'BIM Model': ['ifc', 'application/octet-stream'],
    'Architectural Drawings': ['dwg', 'application/acad'],
    'Structural Drawings': ['dwg', 'application/acad'],
    'Services Drawings (MEP)': ['dwg', 'application/acad'],
  };
  const scrutiniser = ctx.users[USER_SEED.find((u) => u.roleKey === ROLES.PLANNING_OFFICER)?.email ?? 'admin@apcrda.demo'];

  /**
   * A sanctioned permit means every drawing was accepted. One still in scrutiny
   * shows the real mixture — some cleared, one sent back, the rest unread.
   */
  const review = (type: string) => {
    // Nobody scrutinises APCRDA's own order — it is the output, not a submission.
    if (PERMIT_DOCUMENT_TYPES.find((d) => d.type === type)?.kind === 'ISSUED') {
      return { status: 'APPROVED', note: '' };
    }
    if (sanctioned) return { status: 'APPROVED', note: 'Checked against the zonal regulations. In order.' };
    if (type === 'Structural Drawings') {
      return { status: 'REJECTED', note: 'Load calculations for the podium levels are missing. Please resubmit.' };
    }
    if (type === 'BIM Model' || type === 'Fire Safety Plan') return { status: 'PENDING', note: '' };
    return { status: 'APPROVED', note: 'Checked and found in order.' };
  };

  const stamp = (row: any) => {
    const { status, note } = review(row.type);
    row.reviewStatus = status;
    row.reviewNote = note;
    row.reviewedAt = status === 'PENDING' ? null : new Date(at.getTime() + 3 * DAY);
    row.reviewedByName = status === 'PENDING' ? '' : scrutiniser?.name ?? '';
  };

  // Permit papers the stage walk already filed still get scrutinised.
  for (const row of pending.documents) {
    if (row.caseId === caseRow.id && PERMIT_DOCUMENT_TYPES.some((d) => d.type === row.type)) stamp(row);
  }

  for (const d of PERMIT_DOCUMENT_TYPES) {
    if (d.kind === 'ISSUED' && !sanctioned) continue;
    if (d.type === 'Occupancy Certificate') continue; // granted only at closure
    if (already.has(d.type)) continue;

    const versionKey = `${caseRow.id}:${d.type}`;
    const version = (docVersions.get(versionKey) ?? 0) + 1;
    docVersions.set(versionKey, version);
    const [ext, mime] = extension[d.type] ?? ['pdf', 'application/pdf'];

    const row: any = {
      caseId: caseRow.id,
      stageId: 'S13',
      type: d.type,
      name: `${d.type.replace(/[^\w]+/g, '-')}-${caseRow.code.slice(-4)}.${ext}`,
      version,
      fileUrl: ctx.placeholderUrl,
      mimeType: mime,
      size: d.type === 'BIM Model' ? 4_812_004 : 18_432,
      visibility: 'INVESTOR',
      uploadedById: scrutiniser?.id,
      uploadedAt: at,
    };
    stamp(row);
    pending.documents.push(row);
  }
}

// ---------------------------------------------------------------------------

async function seedFinancials(caseRow: any, spec: any, ctx: WalkCtx) {
  const perAcre = ctx.plots[spec.plotKey]?.reservePrice ?? 40_000_000;
  const total = Math.round(perAcre * caseRow.extentAcres);
  const order = stageById[spec.stopAt].order;
  let count = 0;

  const add = async (row: any) => {
    pending.payments.push({ caseId: caseRow.id, ...row });
    count += 1;
  };

  // EMD & processing fee exist from intake onward.
  if (order >= stageById.S1.order) {
    await add({
      type: 'PROCESSING_FEE',
      label: 'Processing fee',
      amount: 250_000,
      dueDate: daysAgo(spec.startedDaysAgo - 2),
      paidDate: daysAgo(spec.startedDaysAgo - 2),
      status: spec.terminal === 'CANCELLED' ? 'PAID' : 'PAID',
      reference: `UTR${Math.floor(Math.random() * 900000000 + 100000000)}`,
    });
    await add({
      type: 'EMD',
      label: 'Earnest money deposit',
      amount: Math.round(total * 0.02),
      dueDate: daysAgo(spec.startedDaysAgo - 3),
      paidDate: daysAgo(spec.startedDaysAgo - 3),
      status: 'PAID',
      reference: `UTR${Math.floor(Math.random() * 900000000 + 100000000)}`,
    });
  }

  // Consideration schedule from Stage 10 onward.
  if (order >= stageById.S10.order && total > 0) {
    const down = Math.round(total * 0.25);
    const each = Math.round((total - down) / 4);
    const base = spec.scheduleStartDaysAgo ?? Math.max(30, spec.startedDaysAgo - 300);

    await add({
      type: 'DOWN_PAYMENT',
      label: 'Down payment (25%)',
      amount: down,
      dueDate: daysAgo(base),
      paidDate: daysAgo(base - 4),
      status: 'PAID',
      reference: `UTR${Math.floor(Math.random() * 900000000 + 100000000)}`,
    });

    for (let i = 0; i < 4; i += 1) {
      const dueDays = base - 90 * (i + 1);
      const isOverdue = spec.overduePayment && i === (spec.overdueInstalment ?? 1);
      const paid = !isOverdue && dueDays > 0;
      await add({
        type: 'INSTALMENT',
        label: `Instalment ${i + 1} of 4`,
        amount: i === 3 ? total - down - each * 3 : each,
        dueDate: dueDays > 0 ? daysAgo(dueDays) : daysAhead(-dueDays),
        paidDate: paid ? daysAgo(Math.max(1, dueDays - 3)) : null,
        status: paid ? 'PAID' : isOverdue ? 'OVERDUE' : 'PENDING',
        penalty: isOverdue ? Math.round((each * 0.12 * 70) / 365) : 0,
        reference: paid ? `UTR${Math.floor(Math.random() * 900000000 + 100000000)}` : '',
      });
    }
  }

  // Building-permit fees, once the permission application is on the desk.
  if (order >= stageById.S13.order) {
    const builtUp = Math.round(caseRow.extentAcres * 43_560 * 1.4);
    const sanctioned = order > stageById.S13.order;
    const raisedDaysAgo = Math.max(20, spec.startedDaysAgo - 425);
    const settle = (paid: boolean) => ({
      paidDate: paid ? daysAgo(Math.max(2, raisedDaysAgo - 6)) : null,
      status: paid ? 'PAID' : 'PENDING',
      reference: paid ? `CHL${Math.floor(Math.random() * 900000 + 100000)}` : '',
    });

    // The scrutiny fee is payable with the application; the rest fall due on sanction.
    await add({
      type: 'PERMIT_SCRUTINY_FEE',
      label: 'Building permit scrutiny fee',
      amount: Math.round(builtUp * 12),
      dueDate: daysAgo(raisedDaysAgo),
      ...settle(true),
    });
    await add({
      type: 'DEVELOPMENT_CHARGE',
      label: 'Development charges',
      amount: Math.round(builtUp * 45),
      dueDate: daysAgo(raisedDaysAgo - 10),
      ...settle(sanctioned),
    });
    await add({
      type: 'BETTERMENT_CHARGE',
      label: 'Betterment charges',
      amount: Math.round(builtUp * 18),
      dueDate: daysAgo(raisedDaysAgo - 10),
      ...settle(sanctioned),
    });
    await add({
      type: 'LABOUR_CESS',
      label: 'Labour cess (1% of construction cost)',
      amount: Math.round(builtUp * 2_200 * 0.01),
      dueDate: daysAgo(raisedDaysAgo - 20),
      ...settle(sanctioned),
    });
  }

  // Stamp duty & registration once the agreement is executed.
  if (order >= stageById.S12.order && total > 0) {
    await add({
      type: 'STAMP_DUTY',
      label: 'Stamp duty',
      amount: Math.round(total * 0.05),
      dueDate: daysAgo(Math.max(5, (spec.agreementDaysAgo ?? 200) - 2)),
      paidDate: daysAgo(Math.max(4, (spec.agreementDaysAgo ?? 200) - 2)),
      status: 'PAID',
      reference: `CHL${Math.floor(Math.random() * 900000 + 100000)}`,
    });
    await add({
      type: 'REGISTRATION_CHARGE',
      label: 'Registration charges',
      amount: Math.round(total * 0.01),
      dueDate: daysAgo(Math.max(5, (spec.agreementDaysAgo ?? 200) - 2)),
      paidDate: daysAgo(Math.max(4, (spec.agreementDaysAgo ?? 200) - 2)),
      status: 'PAID',
      reference: `CHL${Math.floor(Math.random() * 900000 + 100000)}`,
    });
  }

  return count;
}

async function seedExtras(caseRow: any, spec: any, ctx: WalkCtx) {
  const order = stageById[spec.stopAt].order;

  // Building permission record
  if (order >= stageById.S13.order) {
    const sanctioned = order > stageById.S13.order;
    const appliedAt = daysAgo(Math.max(20, spec.startedDaysAgo - 425));
    const sanctionedAt = sanctioned ? daysAgo(Math.max(5, spec.startedDaysAgo - 400)) : null;

    seedPermitDocuments(caseRow, ctx, appliedAt, sanctioned);

    await prisma.buildingPermission.create({
      data: {
        caseId: caseRow.id,
        applicationNo: `BP/${caseRow.code.slice(-4)}`,
        applicationDate: appliedAt,
        proposedFsi: ctx.plots[spec.plotKey]?.fsi ?? 3,
        proposedFar: ctx.plots[spec.plotKey]?.far ?? 3,
        builtUpArea: Math.round(caseRow.extentAcres * 43_560 * 1.4),
        layoutApproved: true,
        status: sanctioned ? 'SANCTIONED' : 'UNDER_SCRUTINY',
        sanctionNo: sanctioned ? `BP-SANC/${caseRow.code.slice(-4)}/${sanctionedAt!.getFullYear()}` : '',
        sanctionedAt,
        // A sanctioned permit runs three years from the date it was granted.
        validUntil: sanctionedAt
          ? new Date(new Date(sanctionedAt).setFullYear(sanctionedAt.getFullYear() + 3))
          : null,
        nocs: toJson([
          { type: 'Fire Services', status: 'CLEARED', ref: 'FS/2025/114', date: daysAgo(410).toISOString().slice(0, 10) },
          { type: 'Environment (SEIAA)', status: 'CLEARED', ref: 'EC/2025/58', date: daysAgo(400).toISOString().slice(0, 10) },
          { type: 'Airport Authority (Height Clearance)', status: order > stageById.S13.order ? 'CLEARED' : 'PENDING', ref: '', date: null },
          { type: 'Pollution Control Board', status: 'NOT_APPLICABLE', ref: '', date: null },
        ]),
        remarks: 'Plans scrutinised against the zonal regulations and the sanctioned layout.',
      },
    });
  }

  // Construction milestones
  if (order >= stageById.S14.order) {
    const done = spec.terminal === 'COMPLETED';
    const pct = spec.progressPct ?? 45;
    const titles: [string, number][] = done
      ? [
          ['Site mobilisation & barricading', 100],
          ['Excavation & foundation', 100],
          ['Structure — Phase I', 100],
          ['Structure — Phase II', 100],
          ['MEP & finishes', 100],
          ['Handover & occupancy', 100],
        ]
      : [
          ['Site mobilisation & barricading', Math.min(100, pct * 2)],
          ['Excavation & foundation', Math.min(100, Math.round(pct * 1.6))],
          ['Structure — Phase I', pct],
          ['Structure — Phase II', Math.max(0, pct - 30)],
          ['MEP & finishes', Math.max(0, pct - 40)],
          ['Handover & occupancy', 0],
        ];

    // Milestones run forward in time from the agreement date, one per quarter.
    const firstMilestoneDaysAgo = spec.agreementDaysAgo ?? Math.max(60, spec.startedDaysAgo - 300);

    for (const [i, [title, actual]] of titles.entries()) {
      const offset = firstMilestoneDaysAgo - i * 90;
      const planned = offset >= 0 ? daysAgo(offset) : daysAhead(-offset);
      pending.milestones.push({
          caseId: caseRow.id,
          title,
          plannedDate: planned,
          plannedPct: Math.min(100, (i + 1) * 17),
          actualPct: actual,
          actualDate: actual >= 100 ? new Date(planned.getTime() + 6 * DAY) : null,
          status: actual >= 100 ? 'COMPLETED' : actual > 0 ? 'IN_PROGRESS' : spec.delayed ? 'DELAYED' : 'PLANNED',
          note: actual > 0 && actual < 100 ? 'Work in progress; monthly report filed.' : '',
          sortOrder: i,
      });
    }
  }

  // Compliance record
  if (order >= stageById.S14.order) {
    await prisma.complianceRecord.create({
      data: {
        caseId: caseRow.id,
        commencementDeadline: caseRow.commencementDeadline ?? daysAhead(spec.commencementInDays ?? 200),
        commencedAt: spec.commenced === false ? null : daysAgo(Math.max(5, spec.startedDaysAgo - 430)),
        status: spec.complianceStatus ?? (spec.terminal === 'COMPLETED' ? 'COMPLETED' : 'GOOD_STANDING'),
        noticeIssuedAt: spec.complianceStatus === 'BREACH_NOTICE' ? daysAgo(25) : null,
        cureDeadline: spec.complianceStatus === 'BREACH_NOTICE' ? daysAhead(65) : null,
        utilisationCertUrl: order >= stageById.S15.order ? ctx.placeholderUrl : null,
        completionCertUrl: spec.terminal === 'COMPLETED' ? ctx.placeholderUrl : null,
        note:
          spec.complianceStatus === 'BREACH_NOTICE'
            ? 'Construction not commenced within the stipulated period. Show-cause notice issued; cure period running.'
            : '',
      },
    });
  }

  // Grievances
  for (const g of spec.grievances ?? []) {
    const raiser = ctx.users[g.raisedByEmail];
    await prisma.grievance.create({
      data: {
        code: g.code,
        caseId: caseRow.id,
        raisedById: raiser?.id ?? null,
        subject: g.subject,
        description: g.description,
        category: g.category,
        status: g.status,
        assigneeId: g.assigneeEmail ? ctx.users[g.assigneeEmail]?.id ?? null : null,
        slaDueAt: daysAhead(g.slaInDays ?? 5),
        resolution: g.resolution ?? '',
        resolvedAt: g.status === 'RESOLVED' || g.status === 'REJECTED' ? daysAgo(4) : null,
        createdAt: daysAgo(g.raisedDaysAgo ?? 20),
      },
    });
  }

  // Cancellation / withdrawal / resumption
  if (spec.cancellation) {
    const cx = spec.cancellation;
    await prisma.cancellation.create({
      data: {
        code: cx.code,
        caseId: caseRow.id,
        initiatedById: ctx.users[cx.initiatedByEmail]?.id ?? null,
        initiatedSide: cx.side,
        type: cx.type,
        reason: cx.reason,
        refundAmount: cx.refundAmount,
        forfeitAmount: cx.forfeitAmount,
        status: cx.status,
        approvedById: cx.approvedByEmail ? ctx.users[cx.approvedByEmail]?.id ?? null : null,
        decisionNote: cx.decisionNote ?? '',
        createdAt: daysAgo(cx.raisedDaysAgo ?? 30),
        decidedAt: cx.status === 'PENDING' ? null : daysAgo((cx.raisedDaysAgo ?? 30) - 6),
      },
    });
  }

  // Comments
  for (const cm of spec.comments ?? []) {
    pending.comments.push({
        caseId: caseRow.id,
        authorId: ctx.users[cm.authorEmail]?.id ?? null,
        body: cm.body,
        visibility: cm.visibility,
        createdAt: daysAgo(cm.daysAgo ?? 10),
    });
  }

  // A notification for the investor so the bell isn't empty.
  const investorId = (await prisma.applicant.findUnique({ where: { id: caseRow.applicantId } }))?.contactUserId;
  if (investorId) {
    pending.notifications.push({
        userId: investorId,
        type: 'CASE_UPDATE',
        title: `${caseRow.code} — status update`,
        message: `Your case is currently at stage ${stageById[spec.stopAt].code} · ${stageById[spec.stopAt].name}.`,
        caseId: caseRow.id,
        link: `/cases/${caseRow.id}`,
        read: Math.random() > 0.6,
        createdAt: daysAgo(Math.floor(Math.random() * 12) + 1),
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
