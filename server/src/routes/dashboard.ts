import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { CASE_STATUS, PHASES, ROLES, STAGE_INSTANCE_STATUS, TERMINAL_STATUSES } from '../lib/enums';
import { caseScope, isInvestor } from '../middleware/auth';
import { loadStages } from '../workflow/engine';

export const dashboardRouter = Router();

/** One lean projection of every in-scope case; every chart below is derived from it. */
const CASE_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  phase: true,
  currentStageId: true,
  mode: true,
  objectiveCategory: true,
  sector: true,
  investmentAmount: true,
  jobsCommitted: true,
  extentAcres: true,
  holdingType: true,
  isConcessional: true,
  landCategory: true,
  slaDueAt: true,
  loiValidUntil: true,
  commencementDeadline: true,
  createdAt: true,
  closedAt: true,
  applicant: { select: { id: true, name: true, entityType: true } },
  plot: { select: { code: true, themeCity: true, landUse: true, zoneCode: true } },
  assignee: { select: { name: true } },
} as const;

type CaseRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  phase: string;
  currentStageId: string | null;
  mode: string;
  objectiveCategory: string;
  sector: string;
  investmentAmount: number;
  jobsCommitted: number;
  extentAcres: number;
  holdingType: string;
  isConcessional: boolean;
  landCategory: string;
  slaDueAt: Date | null;
  loiValidUntil: Date | null;
  commencementDeadline: Date | null;
  createdAt: Date;
  closedAt: Date | null;
  applicant: { id: string; name: string; entityType: string };
  plot: { code: string; themeCity: string; landUse: string; zoneCode: string } | null;
  assignee: { name: string } | null;
};

const DAY = 86_400_000;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d: Date) => `${d.toLocaleString('en-GB', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`;

/** Twelve month buckets ending with the current month, oldest first. */
function lastTwelveMonths(now: Date) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return { key: monthKey(d), label: monthLabel(d), date: d };
  });
}

/** Group rows by a key, folding each group with the supplied reducer. */
function tally<T, V>(rows: T[], keyOf: (row: T) => string, seed: () => V, fold: (acc: V, row: T) => void) {
  const out = new Map<string, V>();
  for (const row of rows) {
    const key = keyOf(row);
    let acc = out.get(key);
    if (!acc) {
      acc = seed();
      out.set(key, acc);
    }
    fold(acc, row);
  }
  return out;
}

const desc = <T,>(rows: T[], by: (row: T) => number) => [...rows].sort((a, b) => by(b) - by(a));

/**
 * The dashboard filters. "ALL" and blanks mean "don't narrow", so the client can
 * send every key on every request without special-casing the unfiltered view.
 */
function readFilters(query: any) {
  const clean = (v: any) => (typeof v === 'string' && v.trim() && v.trim() !== 'ALL' ? v.trim() : null);
  return {
    from: clean(query.from),
    to: clean(query.to),
    city: clean(query.city),
    status: clean(query.status),
    stage: clean(query.stage),
    sector: clean(query.sector),
  };
}

type Filters = ReturnType<typeof readFilters>;

/**
 * Filters as a Prisma `where` fragment. This is folded into `baseWhere`, which
 * every query below already keys off — so one fragment re-scopes the KPIs, the
 * pipeline, the funnel, the money, and all five charts at once.
 */
function caseFilterWhere(f: Filters) {
  const where: Record<string, unknown> = {};
  if (f.from || f.to) {
    const createdAt: Record<string, Date> = {};
    if (f.from) createdAt.gte = new Date(`${f.from}T00:00:00.000`);
    if (f.to) createdAt.lte = new Date(`${f.to}T23:59:59.999`);
    where.createdAt = createdAt;
  }
  if (f.status) where.status = f.status;
  if (f.stage) where.currentStageId = f.stage;
  if (f.sector) where.sector = f.sector;
  if (f.city) where.plot = { themeCity: f.city };
  return where;
}

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const scope = caseScope(req);
    const filters = readFilters(req.query);
    const filtered = Object.values(filters).some(Boolean);
    const baseWhere = { deletedAt: null, ...scope, ...caseFilterWhere(filters) };
    const now = new Date();
    const staff = !isInvestor(req);
    const stages = await loadStages();
    const months = lastTwelveMonths(now);
    const twelveMonthsAgo = months[0].date;

    const [
      cases,
      payments,
      grievances,
      cancellations,
      compliance,
      milestones,
      plots,
      decisions,
      activeInstances,
      instanceCounts,
    ] = await Promise.all([
        prisma.case.findMany({ where: baseWhere, select: CASE_SELECT }) as unknown as Promise<CaseRow[]>,
        prisma.payment.findMany({
          where: { case: baseWhere },
          select: {
            type: true,
            label: true,
            amount: true,
            penalty: true,
            status: true,
            dueDate: true,
            paidDate: true,
            case: { select: { id: true, code: true, applicant: { select: { name: true } } } },
          },
        }),
        prisma.grievance.findMany({
          // Unfiltered, staff still see grievances raised without a case behind
          // them; once a filter is on, only those on in-scope cases count.
          where: isInvestor(req)
            ? { raisedById: req.user!.id }
            : filtered
              ? { case: baseWhere }
              : {},
          select: { category: true, status: true, createdAt: true, resolvedAt: true, slaDueAt: true },
        }),
        prisma.cancellation.findMany({
          where: { case: baseWhere },
          select: { type: true, status: true, refundAmount: true, forfeitAmount: true, createdAt: true },
        }),
        prisma.complianceRecord.findMany({
          where: { case: baseWhere },
          select: { status: true, commencementDeadline: true, commencedAt: true },
        }),
        prisma.constructionMilestone.groupBy({ by: ['status'], where: { case: baseWhere }, _count: true }),
        staff
          ? prisma.plot.findMany({
              // Plots hang off no case, so only the parcel filter can narrow them.
              where: filters.city ? { themeCity: filters.city } : {},
              select: {
                availability: true,
                extentAcres: true,
                themeCity: true,
                landUse: true,
                objectiveCategory: true,
                reservePrice: true,
                landCategory: true,
              },
            })
          : Promise.resolve([]),
        prisma.decision.findMany({
          where: { createdAt: { gte: twelveMonthsAgo }, stageInstance: { case: baseWhere } },
          select: { createdAt: true, kind: true },
        }),
        prisma.stageInstance.findMany({
          where: {
            status: STAGE_INSTANCE_STATUS.ACTIVE,
            case: { ...baseWhere, status: { notIn: TERMINAL_STATUSES } },
          },
          select: { stageId: true, startedAt: true, dueAt: true },
        }),
        // Every stage record ever opened, live or closed — the pipeline panels count these.
        prisma.stageInstance.groupBy({
          by: ['stageId', 'status'],
          where: { case: baseWhere },
          _count: true,
        }),
      ]);

    const myTasks = await buildMyTasks(req);
    const stageMeta = (id: string | null) => stages.find((s) => s.id === id);

    // -----------------------------------------------------------------------
    // Headline counts
    // -----------------------------------------------------------------------
    const live = cases.filter((c) => !TERMINAL_STATUSES.includes(c.status));
    const countBy = (fn: (c: CaseRow) => boolean) => cases.filter(fn).length;
    const completedCases = cases.filter((c) => c.status === CASE_STATUS.COMPLETED);
    const overdueCases = live.filter((c) => c.slaDueAt && c.slaDueAt < now);

    const duePayments = payments.filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE');
    const duesOutstanding = duePayments.reduce((s, p) => s + p.amount + p.penalty, 0);
    const collected = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
    const billed = payments
      .filter((p) => !['REFUNDED', 'WAIVED'].includes(p.status))
      .reduce((s, p) => s + p.amount + p.penalty, 0);

    const cycleDays = completedCases
      .filter((c) => c.closedAt)
      .map((c) => Math.max(0, Math.round((c.closedAt!.getTime() - c.createdAt.getTime()) / DAY)));
    const avgCycleDays = cycleDays.length
      ? Math.round(cycleDays.reduce((s, d) => s + d, 0) / cycleDays.length)
      : 0;

    const kpis = {
      totalCases: cases.length,
      activeCases: live.length,
      overdueCases: overdueCases.length,
      pendingOnMe: myTasks.length,
      lapsedLois: countBy((c) => c.status === CASE_STATUS.LAPSED),
      cancellations: countBy((c) => c.status === CASE_STATUS.CANCELLED || c.status === CASE_STATUS.RESUMED),
      completed: completedCases.length,
      rejected: countBy((c) => c.status === CASE_STATUS.REJECTED),
      openGrievances: grievances.filter((g) => g.status === 'OPEN' || g.status === 'UNDER_REVIEW').length,
      recentCancellations: cancellations.filter(
        (c) => c.createdAt >= new Date(now.getFullYear(), now.getMonth() - 2, 1)
      ).length,
      duesOutstanding,
      duesCount: duePayments.length,

      // Portfolio scale
      totalInvestment: cases.reduce((s, c) => s + c.investmentAmount, 0),
      totalJobs: cases.reduce((s, c) => s + c.jobsCommitted, 0),
      totalAcres: Number(cases.reduce((s, c) => s + c.extentAcres, 0).toFixed(2)),
      collected,
      billed,
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
      avgCycleDays,
      onTimeRate: live.length ? Math.round(((live.length - overdueCases.length) / live.length) * 100) : 100,
      completionRate: cases.length ? Math.round((completedCases.length / cases.length) * 100) : 0,
      concessional: countBy((c) => c.isConcessional),
      sensitiveLand: countBy((c) => c.landCategory === 'SENSITIVE'),
    };

    // -----------------------------------------------------------------------
    // Pipeline
    // -----------------------------------------------------------------------
    const byStage = [...tally(cases, (c) => c.currentStageId ?? '—', () => ({ count: 0 }), (a) => (a.count += 1))]
      .map(([stageId, v]) => {
        const stage = stageMeta(stageId === '—' ? null : stageId);
        return {
          stageId,
          code: stage?.code ?? '—',
          name: stage?.name ?? 'Not started',
          order: stage?.order ?? 99,
          count: v.count,
        };
      })
      .sort((a, b) => a.order - b.order);

    const byStatus = [...tally(cases, (c) => c.status, () => ({ count: 0 }), (a) => (a.count += 1))].map(
      ([status, v]) => ({ status, count: v.count })
    );

    const byPhase = PHASES.map(({ value }) => ({
      phase: value,
      count: cases.filter((c) => c.phase === value).length,
      live: live.filter((c) => c.phase === value).length,
      investment: cases.filter((c) => c.phase === value).reduce((s, c) => s + c.investmentAmount, 0),
    })).filter((p) => p.count > 0 || p.phase === 'A');

    // A funnel reads "reached this phase or beyond", so each step is a subset of the one before it.
    const phaseOrder = PHASES.map((p) => p.value);
    const funnel = phaseOrder.map((phase, i) => {
      const reached = cases.filter((c) => phaseOrder.indexOf(c.phase) >= i).length;
      return {
        phase,
        reached,
        pct: cases.length ? Math.round((reached / cases.length) * 100) : 0,
      };
    });

    const agingEntries = tally(
      activeInstances,
      (si) => si.stageId,
      () => ({ days: [] as number[], overdue: 0 }),
      (acc, si) => {
        acc.days.push(Math.floor((now.getTime() - si.startedAt.getTime()) / DAY));
        if (si.dueAt && si.dueAt < now) acc.overdue += 1;
      }
    );
    const agingByStage = [...agingEntries.entries()]
      .map(([stageId, entry]) => {
        const stage = stageMeta(stageId);
        return {
          stageId,
          code: stage?.code ?? '—',
          name: stage?.name ?? '—',
          order: stage?.order ?? 99,
          avgDays: Math.round(entry.days.reduce((s, d) => s + d, 0) / entry.days.length),
          maxDays: Math.max(...entry.days),
          cases: entry.days.length,
          overdue: entry.overdue,
          onTime: entry.days.length - entry.overdue,
        };
      })
      .sort((a, b) => a.order - b.order);

    /**
     * Stage records per step, split by how each one ended. Unlike `byStage`
     * (where cases are *now*) this counts every attempt at every step, so a
     * returned round and the re-run that followed it both show up. `total`
     * leaves out SKIPPED — a step the case never had to take is not work done.
     */
    const stageActivity = stages.map((stage) => {
      const at = (status: string) =>
        instanceCounts.find((r) => r.stageId === stage.id && r.status === status)?._count ?? 0;
      const inProgress = at(STAGE_INSTANCE_STATUS.ACTIVE) + at(STAGE_INSTANCE_STATUS.PENDING);
      const completed = at(STAGE_INSTANCE_STATUS.COMPLETED);
      const returned = at(STAGE_INSTANCE_STATUS.RETURNED);
      const rejected = at(STAGE_INSTANCE_STATUS.REJECTED);
      const deferred = at(STAGE_INSTANCE_STATUS.DEFERRED);
      const lapsed = at(STAGE_INSTANCE_STATUS.LAPSED);
      return {
        stageId: stage.id,
        code: stage.code,
        name: stage.name,
        order: stage.order,
        phase: stage.phase,
        optional: stage.optional,
        inProgress,
        completed,
        returned,
        rejected,
        deferred,
        lapsed,
        skipped: at(STAGE_INSTANCE_STATUS.SKIPPED),
        total: inProgress + completed + returned + rejected + deferred + lapsed,
      };
    });

    // -----------------------------------------------------------------------
    // Time series
    // -----------------------------------------------------------------------
    const monthly = new Map(
      months.map((m) => [
        m.key,
        {
          month: m.key,
          label: m.label,
          opened: 0,
          closed: 0,
          passed: 0,
          returned: 0,
          rejected: 0,
          collected: 0,
          raised: 0,
        },
      ])
    );
    for (const c of cases) {
      const opened = monthly.get(monthKey(c.createdAt));
      if (opened) opened.opened += 1;
      if (c.closedAt) {
        const closed = monthly.get(monthKey(c.closedAt));
        if (closed) closed.closed += 1;
      }
    }
    for (const d of decisions) {
      const bucket = monthly.get(monthKey(d.createdAt));
      if (!bucket) continue;
      if (d.kind === 'pass') bucket.passed += 1;
      else if (d.kind === 'return' || d.kind === 'defer') bucket.returned += 1;
      else bucket.rejected += 1;
    }
    for (const p of payments) {
      if (p.paidDate) {
        const bucket = monthly.get(monthKey(p.paidDate));
        if (bucket) bucket.collected += p.amount;
      }
      if (p.dueDate) {
        const bucket = monthly.get(monthKey(p.dueDate));
        if (bucket) bucket.raised += p.amount + p.penalty;
      }
    }
    const timeline = [...monthly.values()];

    // -----------------------------------------------------------------------
    // Money
    // -----------------------------------------------------------------------
    const paymentsByStatus = [...tally(
      payments,
      (p) => p.status,
      () => ({ count: 0, amount: 0 }),
      (acc, p) => {
        acc.count += 1;
        acc.amount += p.amount + p.penalty;
      }
    )].map(([status, v]) => ({ status, ...v }));

    const paymentsByType = desc(
      [...tally(
        payments,
        (p) => p.type,
        () => ({ collected: 0, outstanding: 0, count: 0 }),
        (acc, p) => {
          acc.count += 1;
          if (p.status === 'PAID') acc.collected += p.amount;
          else if (p.status === 'PENDING' || p.status === 'OVERDUE') acc.outstanding += p.amount + p.penalty;
        }
      )].map(([type, v]) => ({ type, ...v })),
      (r) => r.collected + r.outstanding
    );

    // -----------------------------------------------------------------------
    // Investment & land
    // -----------------------------------------------------------------------
    const dimension = (keyOf: (c: CaseRow) => string) =>
      desc(
        [...tally(
          cases.filter((c) => keyOf(c)),
          keyOf,
          () => ({ count: 0, investment: 0, jobs: 0, acres: 0, completed: 0 }),
          (acc, c) => {
            acc.count += 1;
            acc.investment += c.investmentAmount;
            acc.jobs += c.jobsCommitted;
            acc.acres += c.extentAcres;
            if (c.status === CASE_STATUS.COMPLETED) acc.completed += 1;
          }
        )].map(([key, v]) => ({ key, ...v, acres: Number(v.acres.toFixed(2)) })),
        (r) => r.investment || r.count
      );

    const byObjective = dimension((c) => c.objectiveCategory).map((r) => ({ category: r.key, ...r }));
    const bySector = dimension((c) => c.sector);
    const byThemeCity = dimension((c) => c.plot?.themeCity ?? '');
    const byLandUse = dimension((c) => c.plot?.landUse ?? '');
    const byEntityType = dimension((c) => c.applicant.entityType);
    const byHoldingType = dimension((c) => c.holdingType).map((r) => ({ holdingType: r.key, ...r }));
    const byMode = dimension((c) => c.mode).map((r) => ({ mode: r.key, ...r }));

    const topApplicants = staff
      ? desc(
          [...tally(
            cases,
            (c) => c.applicant.name,
            () => ({ count: 0, investment: 0, jobs: 0, acres: 0, entityType: '' }),
            (acc, c) => {
              acc.count += 1;
              acc.investment += c.investmentAmount;
              acc.jobs += c.jobsCommitted;
              acc.acres += c.extentAcres;
              acc.entityType = c.applicant.entityType;
            }
          )].map(([name, v]) => ({ name, ...v, acres: Number(v.acres.toFixed(2)) })),
          (r) => r.investment
        ).slice(0, 10)
      : [];

    // Investment against jobs, one dot per allotted case — the outliers are the story.
    const investmentVsJobs = cases
      .filter((c) => c.investmentAmount > 0 && c.jobsCommitted > 0)
      .map((c) => ({
        code: c.code,
        applicant: c.applicant.name,
        sector: c.sector,
        investment: c.investmentAmount,
        jobs: c.jobsCommitted,
        acres: c.extentAcres,
      }));

    const landInventory = staff
      ? {
          totalPlots: plots.length,
          totalAcres: Number(plots.reduce((s, p) => s + p.extentAcres, 0).toFixed(2)),
          byAvailability: [...tally(
            plots,
            (p) => p.availability,
            () => ({ count: 0, acres: 0 }),
            (acc, p) => {
              acc.count += 1;
              acc.acres += p.extentAcres;
            }
          )].map(([availability, v]) => ({ availability, count: v.count, acres: Number(v.acres.toFixed(2)) })),
          byThemeCity: desc(
            [...tally(
              plots,
              (p) => p.themeCity,
              () => ({ total: 0, available: 0, allotted: 0, acres: 0 }),
              (acc, p) => {
                acc.total += 1;
                acc.acres += p.extentAcres;
                if (p.availability === 'AVAILABLE') acc.available += 1;
                if (p.availability === 'ALLOTTED') acc.allotted += 1;
              }
            )].map(([city, v]) => ({ city, ...v, acres: Number(v.acres.toFixed(2)) })),
            (r) => r.total
          ),
        }
      : null;

    // -----------------------------------------------------------------------
    // Risk & compliance
    // -----------------------------------------------------------------------
    const complianceByStatus = [...tally(compliance, (c) => c.status, () => ({ count: 0 }), (a) => (a.count += 1))].map(
      ([status, v]) => ({ status, count: v.count })
    );

    const grievancesByCategory = desc(
      [...tally(
        grievances,
        (g) => g.category,
        () => ({ open: 0, resolved: 0, total: 0 }),
        (acc, g) => {
          acc.total += 1;
          if (g.status === 'RESOLVED' || g.status === 'REJECTED') acc.resolved += 1;
          else acc.open += 1;
        }
      )].map(([category, v]) => ({ category, ...v })),
      (r) => r.total
    );

    const cancellationsByType = [...tally(
      cancellations,
      (c) => c.type,
      () => ({ count: 0, refund: 0, forfeit: 0, pending: 0 }),
      (acc, c) => {
        acc.count += 1;
        acc.refund += c.refundAmount;
        acc.forfeit += c.forfeitAmount;
        if (c.status === 'PENDING') acc.pending += 1;
      }
    )].map(([type, v]) => ({ type, ...v }));

    // Anything with a date in the next 45 days, or already past — the watch list.
    const horizon = new Date(now.getTime() + 45 * DAY);
    const deadlines = [
      ...cases.flatMap((c) =>
        [
          { kind: 'SLA on the current step', at: c.slaDueAt },
          { kind: 'Offer expires', at: c.loiValidUntil },
          { kind: 'Construction must start', at: c.commencementDeadline },
        ]
          .filter((d) => d.at && d.at <= horizon && !TERMINAL_STATUSES.includes(c.status))
          .map((d) => ({
            caseId: c.id,
            code: c.code,
            applicant: c.applicant.name,
            kind: d.kind,
            dueAt: d.at as Date,
            overdue: (d.at as Date) < now,
          }))
      ),
      ...duePayments
        .filter((p) => p.dueDate && p.dueDate <= horizon)
        .map((p) => ({
          caseId: p.case.id,
          code: p.case.code,
          applicant: p.case.applicant.name,
          kind: `Payment — ${p.label}`,
          dueAt: p.dueDate as Date,
          overdue: (p.dueDate as Date) < now,
        })),
    ].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

    // -----------------------------------------------------------------------
    // Row-level tables
    // -----------------------------------------------------------------------
    const caseRows = cases
      .map((c) => {
        const stage = stageMeta(c.currentStageId);
        return {
          id: c.id,
          code: c.code,
          title: c.title,
          applicant: c.applicant.name,
          entityType: c.applicant.entityType,
          sector: c.sector,
          plot: c.plot?.code ?? '',
          themeCity: c.plot?.themeCity ?? '',
          landUse: c.plot?.landUse ?? '',
          mode: c.mode,
          objectiveCategory: c.objectiveCategory,
          holdingType: c.holdingType,
          phase: c.phase,
          stageCode: stage?.code ?? '—',
          stageName: stage?.name ?? 'Not started',
          status: c.status,
          investment: c.investmentAmount,
          jobs: c.jobsCommitted,
          acres: c.extentAcres,
          concessional: c.isConcessional,
          assignee: c.assignee?.name ?? '',
          ageDays: Math.floor((now.getTime() - c.createdAt.getTime()) / DAY),
          slaDueAt: c.slaDueAt,
          overdue: !!c.slaDueAt && c.slaDueAt < now && !TERMINAL_STATUSES.includes(c.status),
          createdAt: c.createdAt,
          closedAt: c.closedAt,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const paymentRows = payments
      .filter((p) => p.status !== 'PAID')
      .map((p) => ({
        caseId: p.case.id,
        code: p.case.code,
        applicant: p.case.applicant.name,
        type: p.type,
        label: p.label,
        amount: p.amount,
        penalty: p.penalty,
        total: p.amount + p.penalty,
        status: p.status,
        dueDate: p.dueDate,
        overdue: !!p.dueDate && p.dueDate < now && (p.status === 'PENDING' || p.status === 'OVERDUE'),
      }))
      .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));

    res.json({
      generatedAt: now,
      scope: staff ? 'ALL' : 'OWN',
      filters,
      kpis,
      charts: {
        byStage,
        byStatus,
        byPhase,
        funnel,
        agingByStage,
        stageActivity,
        approvalsOverTime: timeline.map(({ month, label, passed, returned, rejected }) => ({
          month,
          label,
          passed,
          returned,
          rejected,
        })),
        caseFlowOverTime: timeline.map(({ month, label, opened, closed }) => ({ month, label, opened, closed })),
        collectionsOverTime: timeline.map(({ month, label, collected: got, raised }) => ({
          month,
          label,
          collected: Math.round(got),
          raised: Math.round(raised),
        })),
        paymentsByStatus,
        paymentsByType,
        byObjective,
        bySector,
        byThemeCity,
        byLandUse,
        byEntityType,
        byHoldingType,
        byMode,
        investmentVsJobs,
        complianceByStatus,
        milestonesByStatus: milestones.map((m) => ({ status: m.status, count: m._count })),
        grievancesByCategory,
        cancellationsByType,
        landInventory,
        topApplicants,
      },
      tables: {
        cases: caseRows,
        payments: paymentRows,
        deadlines: deadlines.slice(0, 200),
      },
      myTasks,
    });
  })
);

/** "Pending on me" = active stage instances my role owns (investors: their own cases). */
async function buildMyTasks(req: any) {
  const user = req.user!;
  if (user.roleKey === ROLES.VIEWER) return [];

  const stages = await loadStages();
  let stageIds: string[];

  if (user.roleKey === ROLES.SUPER_ADMIN) {
    stageIds = stages.map((s) => s.id);
  } else {
    const perms = await prisma.permission.findMany({
      where: { roleKey: user.roleKey, canAct: true },
      select: { stageId: true },
    });
    stageIds = perms.map((p) => p.stageId);
  }
  if (!stageIds.length) return [];

  const instances = await prisma.stageInstance.findMany({
    where: {
      status: STAGE_INSTANCE_STATUS.ACTIVE,
      stageId: { in: stageIds },
      case: { deletedAt: null, status: { notIn: TERMINAL_STATUSES }, ...caseScope(req) },
    },
    orderBy: { dueAt: 'asc' },
    take: 100,
    include: {
      case: { select: { id: true, code: true, title: true, applicant: { select: { name: true } } } },
      stage: { select: { code: true, name: true, phase: true } },
    },
  });

  const now = new Date();
  return instances.map((si) => ({
    stageInstanceId: si.id,
    caseId: si.case.id,
    caseCode: si.case.code,
    caseTitle: si.case.title,
    applicant: si.case.applicant.name,
    stageCode: si.stage.code,
    stageName: si.stage.name,
    phase: si.stage.phase,
    roundLabel: si.roundLabel,
    dueAt: si.dueAt,
    startedAt: si.startedAt,
    isOverdue: !!si.dueAt && si.dueAt < now,
    daysOpen: Math.floor((now.getTime() - si.startedAt.getTime()) / DAY),
  }));
}

/** Committee queues: everything awaiting a specific body. */
dashboardRouter.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const roleKey = String(req.query.roleKey ?? req.user!.roleKey);
    const perms = await prisma.permission.findMany({
      where: { roleKey, canAct: true },
      select: { stageId: true },
    });
    const stageIds = perms.map((p) => p.stageId);

    const instances = stageIds.length
      ? await prisma.stageInstance.findMany({
          where: {
            status: STAGE_INSTANCE_STATUS.ACTIVE,
            stageId: { in: stageIds },
            case: { deletedAt: null, status: { notIn: TERMINAL_STATUSES }, ...caseScope(req) },
          },
          orderBy: { dueAt: 'asc' },
          include: {
            case: {
              include: {
                applicant: { select: { name: true, entityType: true } },
                plot: { select: { code: true, themeCity: true, extentAcres: true } },
              },
            },
            stage: { select: { id: true, code: true, name: true, phase: true, maxRounds: true } },
          },
        })
      : [];

    const now = new Date();
    res.json({
      roleKey,
      stageIds,
      items: instances.map((si) => ({
        stageInstanceId: si.id,
        roundLabel: si.roundLabel,
        round: si.round,
        dueAt: si.dueAt,
        isOverdue: !!si.dueAt && si.dueAt < now,
        daysOpen: Math.floor((now.getTime() - si.startedAt.getTime()) / DAY),
        stage: si.stage,
        case: si.case,
      })),
    });
  })
);
