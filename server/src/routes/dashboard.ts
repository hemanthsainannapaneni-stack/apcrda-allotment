import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { CASE_STATUS, ROLES, STAGE_INSTANCE_STATUS, TERMINAL_STATUSES } from '../lib/enums';
import { caseScope, isInvestor } from '../middleware/auth';
import { loadStages } from '../workflow/engine';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const scope = caseScope(req);
    const baseWhere = { deletedAt: null, ...scope };
    const now = new Date();
    const stages = await loadStages();

    const [
      total,
      active,
      overdue,
      lapsed,
      cancelled,
      completed,
      rejected,
      byStage,
      byPhase,
      byObjective,
      byHolding,
      byMode,
      grievancesOpen,
      recentCancellations,
      paymentsDue,
    ] = await Promise.all([
      prisma.case.count({ where: baseWhere }),
      prisma.case.count({ where: { ...baseWhere, status: { notIn: TERMINAL_STATUSES } } }),
      prisma.case.count({
        where: { ...baseWhere, status: { notIn: TERMINAL_STATUSES }, slaDueAt: { lt: now } },
      }),
      prisma.case.count({ where: { ...baseWhere, status: CASE_STATUS.LAPSED } }),
      prisma.case.count({ where: { ...baseWhere, status: { in: [CASE_STATUS.CANCELLED, CASE_STATUS.RESUMED] } } }),
      prisma.case.count({ where: { ...baseWhere, status: CASE_STATUS.COMPLETED } }),
      prisma.case.count({ where: { ...baseWhere, status: CASE_STATUS.REJECTED } }),
      prisma.case.groupBy({ by: ['currentStageId'], where: baseWhere, _count: true }),
      prisma.case.groupBy({ by: ['phase'], where: baseWhere, _count: true }),
      prisma.case.groupBy({ by: ['objectiveCategory'], where: baseWhere, _count: true, _sum: { investmentAmount: true } }),
      prisma.case.groupBy({ by: ['holdingType'], where: baseWhere, _count: true }),
      prisma.case.groupBy({ by: ['mode'], where: baseWhere, _count: true }),
      prisma.grievance.count({
        where: { status: { in: ['OPEN', 'UNDER_REVIEW'] }, ...(isInvestor(req) ? { raisedById: req.user!.id } : {}) },
      }),
      prisma.cancellation.count({
        where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 2, 1) }, case: baseWhere },
      }),
      prisma.payment.aggregate({
        where: { status: { in: ['PENDING', 'OVERDUE'] }, case: baseWhere },
        _sum: { amount: true, penalty: true },
        _count: true,
      }),
    ]);

    const myTasks = await buildMyTasks(req);

    // Approvals over the last 12 months, from the decision log.
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const decisions = await prisma.decision.findMany({
      where: { createdAt: { gte: twelveMonthsAgo }, stageInstance: { case: baseWhere } },
      select: { createdAt: true, kind: true },
    });
    const monthly = new Map<string, { month: string; passed: number; returned: number; rejected: number }>();
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly.set(key, { month: key, passed: 0, returned: 0, rejected: 0 });
    }
    for (const d of decisions) {
      const key = `${d.createdAt.getFullYear()}-${String(d.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const bucket = monthly.get(key);
      if (!bucket) continue;
      if (d.kind === 'pass') bucket.passed += 1;
      else if (d.kind === 'return' || d.kind === 'defer') bucket.returned += 1;
      else bucket.rejected += 1;
    }

    // Aging: how long the currently-active stage instances have been open.
    const activeInstances = await prisma.stageInstance.findMany({
      where: { status: STAGE_INSTANCE_STATUS.ACTIVE, case: { ...baseWhere, status: { notIn: TERMINAL_STATUSES } } },
      select: { stageId: true, startedAt: true, dueAt: true },
    });
    const agingMap = new Map<string, { days: number[]; overdue: number }>();
    for (const si of activeInstances) {
      const entry = agingMap.get(si.stageId) ?? { days: [], overdue: 0 };
      entry.days.push(Math.floor((now.getTime() - si.startedAt.getTime()) / 86_400_000));
      if (si.dueAt && si.dueAt < now) entry.overdue += 1;
      agingMap.set(si.stageId, entry);
    }

    const stageMeta = (id: string | null) => stages.find((s) => s.id === id);

    res.json({
      kpis: {
        totalCases: total,
        activeCases: active,
        overdueCases: overdue,
        pendingOnMe: myTasks.length,
        lapsedLois: lapsed,
        cancellations: cancelled,
        completed,
        rejected,
        openGrievances: grievancesOpen,
        recentCancellations,
        duesOutstanding: (paymentsDue._sum.amount ?? 0) + (paymentsDue._sum.penalty ?? 0),
        duesCount: paymentsDue._count,
      },
      charts: {
        byStage: byStage
          .map((g) => {
            const stage = stageMeta(g.currentStageId);
            return {
              stageId: g.currentStageId,
              code: stage?.code ?? '—',
              name: stage?.name ?? 'Not started',
              order: stage?.order ?? 99,
              count: g._count,
            };
          })
          .sort((a, b) => a.order - b.order),
        byPhase: byPhase.map((g) => ({ phase: g.phase, count: g._count })).sort((a, b) => a.phase.localeCompare(b.phase)),
        byObjective: byObjective.map((g) => ({
          category: g.objectiveCategory,
          count: g._count,
          investment: g._sum.investmentAmount ?? 0,
        })),
        byHoldingType: byHolding.map((g) => ({ holdingType: g.holdingType, count: g._count })),
        byMode: byMode.map((g) => ({ mode: g.mode, count: g._count })),
        approvalsOverTime: [...monthly.values()],
        agingByStage: [...agingMap.entries()]
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
            };
          })
          .sort((a, b) => a.order - b.order),
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
    daysOpen: Math.floor((now.getTime() - si.startedAt.getTime()) / 86_400_000),
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
        daysOpen: Math.floor((now.getTime() - si.startedAt.getTime()) / 86_400_000),
        stage: si.stage,
        case: si.case,
      })),
    });
  })
);
