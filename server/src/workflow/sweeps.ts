import { prisma } from '../lib/prisma';
import { getSettings } from '../lib/settings';
import { notify } from '../lib/notify';
import { auditSystem } from '../lib/audit';
import { CASE_STATUS, ROLES, STAGE_INSTANCE_STATUS, TERMINAL_STATUSES } from '../lib/enums';
import { addDays } from './engine';

/**
 * Time-driven rules that nothing else triggers: LOI expiry, payment penalties,
 * the commencement-deadline tracker, and SLA warnings. Runs at boot and hourly.
 */
export async function runSweeps() {
  const settings = await getSettings(true);
  const results = {
    loisLapsed: await sweepLapsedLois(settings),
    paymentsOverdue: await sweepOverduePayments(settings),
    complianceFlagged: await sweepCommencementDeadlines(settings),
    slaWarnings: await sweepSlaWarnings(),
  };
  return results;
}

async function sweepLapsedLois(settings: Record<string, any>) {
  const now = new Date();
  const warnDays = Number(settings.loi_expiry_warning_days ?? 15);

  const nearing = await prisma.case.findMany({
    where: {
      deletedAt: null,
      status: { notIn: TERMINAL_STATUSES },
      loiAcceptedAt: null,
      loiValidUntil: { gt: now, lte: addDays(now, warnDays) },
    },
    select: { id: true, code: true, loiValidUntil: true, applicant: { select: { contactUserId: true } } },
  });
  for (const row of nearing) {
    await notifyOnce(row.id, 'LOI_EXPIRING', {
      userIds: row.applicant.contactUserId ? [row.applicant.contactUserId] : [],
      roleKeys: [ROLES.LANDS_OFFICER],
      title: `${row.code} — LOI expiring soon`,
      message: `The Letter of Intent lapses on ${row.loiValidUntil?.toDateString()}. Accept and begin payment before then.`,
    });
  }

  const expired = await prisma.case.findMany({
    where: {
      deletedAt: null,
      status: { notIn: TERMINAL_STATUSES },
      loiAcceptedAt: null,
      loiValidUntil: { lt: now },
    },
    select: { id: true, code: true },
  });

  for (const row of expired) {
    await prisma.case.update({
      where: { id: row.id },
      data: { status: CASE_STATUS.LAPSED, closedAt: now, slaDueAt: null },
    });
    await prisma.stageInstance.updateMany({
      where: { caseId: row.id, status: STAGE_INSTANCE_STATUS.ACTIVE },
      data: { status: STAGE_INSTANCE_STATUS.LAPSED, completedAt: now },
    });
    await auditSystem({
      action: 'LOI_LAPSED',
      entity: 'Case',
      entityId: row.id,
      caseCode: row.code,
      summary: 'LOI validity window expired without acceptance — case flagged Lapsed.',
    });
    await notify({
      roleKeys: [ROLES.LANDS_OFFICER, ROLES.SUPER_ADMIN],
      type: 'LOI_LAPSED',
      title: `${row.code} — LOI lapsed`,
      message: 'The LOI validity window expired without acceptance. The case has been flagged Lapsed.',
      caseId: row.id,
      link: `/cases/${row.id}`,
    });
  }

  return expired.length;
}

async function sweepOverduePayments(settings: Record<string, any>) {
  const now = new Date();
  const annualRatePct = Number(settings.penalty_rate_pct_per_annum ?? 12);

  const due = await prisma.payment.findMany({
    where: { status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: now } },
    include: { case: { select: { id: true, code: true, status: true, applicant: { select: { contactUserId: true } } } } },
  });

  let count = 0;
  for (const payment of due) {
    if (TERMINAL_STATUSES.includes(payment.case.status)) continue;
    const daysLate = Math.floor((now.getTime() - payment.dueDate!.getTime()) / 86_400_000);
    const penalty = Math.round((payment.amount * (annualRatePct / 100) * daysLate) / 365);

    if (payment.status === 'OVERDUE' && payment.penalty === penalty) continue;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'OVERDUE', penalty },
    });
    count += 1;

    if (payment.status !== 'OVERDUE') {
      await notify({
        userIds: payment.case.applicant.contactUserId ? [payment.case.applicant.contactUserId] : [],
        roleKeys: [ROLES.FINANCE_OFFICER],
        type: 'PAYMENT_OVERDUE',
        title: `${payment.case.code} — payment overdue`,
        message: `${payment.label} was due on ${payment.dueDate?.toDateString()}. Penalty accrues at ${annualRatePct}% per annum.`,
        caseId: payment.case.id,
        link: `/cases/${payment.case.id}`,
      });
    }
  }
  return count;
}

async function sweepCommencementDeadlines(settings: Record<string, any>) {
  const now = new Date();
  const warnDays = Number(settings.commencement_warning_days ?? 90);
  const cureDays = Number(settings.cure_period_days ?? 90);

  const records = await prisma.complianceRecord.findMany({
    where: { commencementDeadline: { not: null }, commencedAt: null, status: { notIn: ['RESUMED', 'COMPLETED'] } },
    include: { case: { select: { id: true, code: true, status: true, applicant: { select: { contactUserId: true } } } } },
  });

  let flagged = 0;
  for (const record of records) {
    if (TERMINAL_STATUSES.includes(record.case.status)) continue;
    const deadline = record.commencementDeadline!;

    if (deadline < now && record.status !== 'BREACH_NOTICE' && record.status !== 'CURE_PERIOD') {
      await prisma.complianceRecord.update({
        where: { id: record.id },
        data: {
          status: 'BREACH_NOTICE',
          noticeIssuedAt: now,
          cureDeadline: addDays(now, cureDays),
          note: `Construction not commenced by ${deadline.toDateString()}. Cure period of ${cureDays} days opened.`,
        },
      });
      flagged += 1;
      await auditSystem({
        action: 'COMMENCEMENT_BREACH',
        entity: 'Case',
        entityId: record.case.id,
        caseCode: record.case.code,
        summary: `Commencement deadline breached; ${cureDays}-day cure period opened.`,
      });
      await notify({
        userIds: record.case.applicant.contactUserId ? [record.case.applicant.contactUserId] : [],
        roleKeys: [ROLES.LANDS_OFFICER, ROLES.PLANNING_OFFICER],
        type: 'COMMENCEMENT_BREACH',
        title: `${record.case.code} — commencement deadline breached`,
        message: `Construction had to commence by ${deadline.toDateString()}. A ${cureDays}-day cure period is now running; resumption may follow.`,
        caseId: record.case.id,
        link: `/cases/${record.case.id}`,
      });
    } else if (deadline > now && deadline <= addDays(now, warnDays) && record.status === 'PENDING') {
      await prisma.complianceRecord.update({ where: { id: record.id }, data: { status: 'AT_RISK' } });
      flagged += 1;
      await notify({
        userIds: record.case.applicant.contactUserId ? [record.case.applicant.contactUserId] : [],
        roleKeys: [ROLES.LANDS_OFFICER],
        type: 'COMMENCEMENT_APPROACHING',
        title: `${record.case.code} — commencement deadline approaching`,
        message: `Construction must commence by ${deadline.toDateString()}.`,
        caseId: record.case.id,
        link: `/cases/${record.case.id}`,
      });
    }
  }
  return flagged;
}

async function sweepSlaWarnings() {
  const now = new Date();
  const overdue = await prisma.stageInstance.findMany({
    where: { status: STAGE_INSTANCE_STATUS.ACTIVE, dueAt: { lt: now } },
    include: { case: { select: { id: true, code: true, status: true } }, stage: { select: { code: true, name: true } } },
  });

  let warned = 0;
  for (const instance of overdue) {
    if (TERMINAL_STATUSES.includes(instance.case.status)) continue;
    const sent = await notifyOnce(instance.case.id, `SLA_BREACH:${instance.id}`, {
      roleKeys: [instance.ownerRoleKey],
      title: `${instance.case.code} — SLA breached`,
      message: `Stage ${instance.stage.code} · ${instance.stage.name} passed its due date of ${instance.dueAt?.toDateString()}.`,
    });
    if (sent) warned += 1;
  }
  return warned;
}

/** Prevents the hourly sweep from re-notifying the same thing forever. */
async function notifyOnce(
  caseId: string,
  type: string,
  input: { userIds?: string[]; roleKeys?: string[]; title: string; message: string }
) {
  const existing = await prisma.notification.findFirst({ where: { caseId, type } });
  if (existing) return false;
  await notify({ ...input, type, caseId, link: `/cases/${caseId}` });
  return true;
}
