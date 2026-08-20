import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, forbidden, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { getSettings } from '../lib/settings';
import { notify } from '../lib/notify';
import { CAPABILITIES, ROLES } from '../lib/enums';
import { assertCaseAccess, caseScope, requireCapability } from '../middleware/auth';
import { ensurePaymentSchedule } from '../workflow/engine';

export const paymentsRouter = Router();

paymentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 50);
    const and: any[] = [{ case: { deletedAt: null, ...caseScope(req) } }];

    if (req.query.caseId) and.push({ caseId: String(req.query.caseId) });
    if (req.query.status && req.query.status !== 'ALL') and.push({ status: String(req.query.status) });
    if (req.query.type && req.query.type !== 'ALL') and.push({ type: String(req.query.type) });
    if (req.query.from) and.push({ dueDate: { gte: new Date(String(req.query.from)) } });
    if (req.query.to) and.push({ dueDate: { lte: new Date(String(req.query.to)) } });

    const where = { AND: and };
    const [items, total, totals] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }],
        skip,
        take,
        include: { case: { select: { id: true, code: true, title: true, applicant: { select: { name: true } } } } },
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({ by: ['status'], where, _sum: { amount: true, penalty: true }, _count: true }),
    ]);

    res.json({
      ...paged(items, total, page, pageSize),
      summary: totals.map((t) => ({
        status: t.status,
        count: t._count,
        amount: t._sum.amount ?? 0,
        penalty: t._sum.penalty ?? 0,
      })),
    });
  })
);

const paymentSchema = z.object({
  caseId: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  amount: z.coerce.number().positive(),
  dueDate: z.string().optional().nullable(),
  note: z.string().optional().default(''),
});

paymentsRouter.post(
  '/',
  requireCapability(CAPABILITIES.PAYMENTS_MANAGE),
  asyncHandler(async (req, res) => {
    const body = paymentSchema.parse(req.body);
    await assertCaseAccess(req, body.caseId);

    const row = await prisma.payment.create({
      data: {
        caseId: body.caseId,
        type: body.type,
        label: body.label,
        amount: body.amount,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        note: body.note,
      },
      include: { case: { select: { code: true } } },
    });
    await audit(req, {
      action: 'PAYMENT_CREATED',
      entity: 'Payment',
      entityId: row.id,
      caseCode: row.case.code,
      summary: `${row.label} of ₹${row.amount.toLocaleString('en-IN')} added`,
    });
    res.status(201).json(row);
  })
);

/** Generates the down-payment + instalment schedule from the plot's reserve price. */
paymentsRouter.post(
  '/schedule',
  requireCapability(CAPABILITIES.PAYMENTS_MANAGE),
  asyncHandler(async (req, res) => {
    const { caseId } = z.object({ caseId: z.string().min(1) }).parse(req.body);
    await assertCaseAccess(req, caseId);
    await ensurePaymentSchedule(caseId);
    const rows = await prisma.payment.findMany({ where: { caseId }, orderBy: { dueDate: 'asc' } });
    await audit(req, {
      action: 'PAYMENT_SCHEDULE_GENERATED',
      entity: 'Case',
      entityId: caseId,
      summary: `Payment schedule generated (${rows.length} line items)`,
    });
    res.json(rows);
  })
);

/** Investor records a payment; Finance reconciles it. */
paymentsRouter.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        reference: z.string().min(3, 'A transaction / UTR reference is required.'),
        paidDate: z.string().optional(),
        amount: z.coerce.number().positive().optional(),
      })
      .parse(req.body);

    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { case: true } });
    if (!payment) throw notFound('Payment not found.');
    await assertCaseAccess(req, payment.caseId);

    const canPay =
      req.user!.capabilities.includes(CAPABILITIES.PAYMENTS_PAY) ||
      req.user!.capabilities.includes(CAPABILITIES.PAYMENTS_MANAGE) ||
      req.user!.roleKey === ROLES.SUPER_ADMIN;
    if (!canPay) throw forbidden('Your role cannot record payments.');
    if (payment.status === 'PAID') throw badRequest('This item is already marked paid.');

    const row = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        paidDate: body.paidDate ? new Date(body.paidDate) : new Date(),
        reference: body.reference,
        amount: body.amount ?? payment.amount,
      },
    });

    await audit(req, {
      action: 'PAYMENT_RECORDED',
      entity: 'Payment',
      entityId: row.id,
      caseCode: payment.case.code,
      summary: `${row.label} paid (ref ${row.reference})`,
      before: { status: payment.status },
      after: { status: 'PAID', reference: row.reference, penalty: row.penalty },
    });

    await notify({
      roleKeys: [ROLES.FINANCE_OFFICER],
      type: 'PAYMENT_RECEIVED',
      title: `${payment.case.code} — payment recorded`,
      message: `${row.label} of ₹${row.amount.toLocaleString('en-IN')} recorded against reference ${row.reference}.`,
      caseId: payment.caseId,
      link: `/cases/${payment.caseId}`,
    });

    res.json(row);
  })
);

paymentsRouter.patch(
  '/:id',
  requireCapability(CAPABILITIES.PAYMENTS_MANAGE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'WAIVED', 'REFUNDED', 'FORFEITED']).optional(),
        amount: z.coerce.number().positive().optional(),
        penalty: z.coerce.number().min(0).optional(),
        dueDate: z.string().optional().nullable(),
        note: z.string().optional(),
      })
      .parse(req.body);

    const before = await prisma.payment.findUniqueOrThrow({ where: { id: req.params.id }, include: { case: true } });
    const after = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        ...body,
        dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
        paidDate: body.status === 'PAID' && !before.paidDate ? new Date() : undefined,
      },
    });

    await audit(req, {
      action: 'PAYMENT_UPDATED',
      entity: 'Payment',
      entityId: after.id,
      caseCode: before.case.code,
      summary: `${after.label} → ${after.status}`,
      before: { status: before.status, amount: before.amount, penalty: before.penalty },
      after: { status: after.status, amount: after.amount, penalty: after.penalty },
    });
    res.json(after);
  })
);

/**
 * Refund / forfeiture calculator used by the cancellation flow.
 * Forfeiture rises with how far the case has travelled.
 */
paymentsRouter.get(
  '/refund-preview/:caseId',
  asyncHandler(async (req, res) => {
    await assertCaseAccess(req, req.params.caseId);
    const preview = await computeRefund(req.params.caseId, String(req.query.type ?? 'WITHDRAWAL'));
    res.json(preview);
  })
);

export async function computeRefund(caseId: string, type: string) {
  const settings = await getSettings();
  const caseRow = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { payments: true },
  });

  const paid = caseRow.payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0);

  const rates: Record<string, number> = {
    WITHDRAWAL: Number(settings.forfeiture_pct_withdrawal ?? 10),
    CANCELLATION: Number(settings.forfeiture_pct_cancellation ?? 25),
    RESUMPTION: Number(settings.forfeiture_pct_resumption ?? 50),
  };
  const pct = rates[type] ?? 10;

  // EMD is forfeited in full on an APCRDA-initiated cancellation or resumption.
  const emd = caseRow.payments
    .filter((p) => p.type === 'EMD' && p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0);
  const emdForfeit = type === 'WITHDRAWAL' ? 0 : emd;

  const forfeitAmount = Math.round((paid - emd) * (pct / 100) + emdForfeit);
  const refundAmount = Math.max(0, paid - forfeitAmount);

  return {
    caseId,
    type,
    totalPaid: paid,
    forfeiturePct: pct,
    emdForfeited: emdForfeit,
    forfeitAmount,
    refundAmount,
    basis: `${pct}% of consideration paid (₹${(paid - emd).toLocaleString('en-IN')})` +
      (emdForfeit ? ` plus EMD of ₹${emdForfeit.toLocaleString('en-IN')} forfeited in full` : ''),
  };
}
