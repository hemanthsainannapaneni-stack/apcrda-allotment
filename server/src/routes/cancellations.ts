import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, conflict, notFound, pageParams, paged } from '../lib/http';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { CAPABILITIES, CASE_STATUS, ROLES, STAGE_INSTANCE_STATUS, TERMINAL_STATUSES } from '../lib/enums';
import { assertCaseAccess, caseScope, isInvestor, requireCapability } from '../middleware/auth';
import { computeRefund } from './payments';

export const cancellationsRouter = Router();

cancellationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query, 25);
    const and: any[] = [{ case: { deletedAt: null, ...caseScope(req) } }];
    if (req.query.caseId) and.push({ caseId: String(req.query.caseId) });
    if (req.query.status && req.query.status !== 'ALL') and.push({ status: String(req.query.status) });
    if (req.query.type && req.query.type !== 'ALL') and.push({ type: String(req.query.type) });

    const where = { AND: and };
    const [items, total] = await Promise.all([
      prisma.cancellation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          case: { select: { id: true, code: true, title: true, status: true } },
          initiatedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
        },
      }),
      prisma.cancellation.count({ where }),
    ]);
    res.json(paged(items, total, page, pageSize));
  })
);

const createSchema = z.object({
  caseId: z.string().min(1),
  type: z.enum(['WITHDRAWAL', 'CANCELLATION', 'RESUMPTION']),
  reason: z.string().min(10, 'Give a reason of at least 10 characters.'),
});

cancellationsRouter.post(
  '/',
  requireCapability(CAPABILITIES.CANCELLATION_REQUEST, CAPABILITIES.CANCELLATION_DECIDE),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    await assertCaseAccess(req, body.caseId);

    const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: body.caseId } });
    if (TERMINAL_STATUSES.includes(caseRow.status)) {
      throw conflict(`Case is already ${caseRow.status.toLowerCase()}.`);
    }
    if (isInvestor(req) && body.type !== 'WITHDRAWAL') {
      throw badRequest('Investors may only request a withdrawal. Cancellation and resumption are APCRDA-initiated.');
    }

    const open = await prisma.cancellation.findFirst({ where: { caseId: body.caseId, status: 'PENDING' } });
    if (open) throw conflict(`A ${open.type.toLowerCase()} request is already pending on this case.`);

    const refund = await computeRefund(body.caseId, body.type);
    const count = await prisma.cancellation.count();

    const row = await prisma.cancellation.create({
      data: {
        code: `CNL/${new Date().getFullYear()}/${String(count + 1).padStart(4, '0')}`,
        caseId: body.caseId,
        initiatedById: req.user!.id,
        initiatedSide: isInvestor(req) ? 'INVESTOR' : 'APCRDA',
        type: body.type,
        reason: body.reason,
        refundAmount: refund.refundAmount,
        forfeitAmount: refund.forfeitAmount,
      },
    });

    await prisma.case.update({ where: { id: body.caseId }, data: { status: CASE_STATUS.ON_HOLD } });

    await audit(req, {
      action: 'CANCELLATION_REQUESTED',
      entity: 'Cancellation',
      entityId: row.id,
      caseCode: caseRow.code,
      summary: `${row.type} requested — refund ₹${refund.refundAmount.toLocaleString('en-IN')}, forfeit ₹${refund.forfeitAmount.toLocaleString('en-IN')}`,
      after: { ...refund, type: row.type, reason: row.reason },
    });
    await notify({
      roleKeys: [ROLES.LANDS_OFFICER, ROLES.FINANCE_OFFICER, ROLES.AUTHORITY_APPROVER],
      type: 'CANCELLATION_REQUESTED',
      title: `${caseRow.code} — ${row.type.toLowerCase()} requested`,
      message: row.reason,
      caseId: caseRow.id,
      link: `/cases/${caseRow.id}`,
    });

    res.status(201).json({ ...row, refundPreview: refund });
  })
);

cancellationsRouter.post(
  '/:id/decide',
  requireCapability(CAPABILITIES.CANCELLATION_DECIDE),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        approve: z.boolean(),
        note: z.string().min(5, 'A decision note is required.'),
        refundAmount: z.coerce.number().min(0).optional(),
        forfeitAmount: z.coerce.number().min(0).optional(),
      })
      .parse(req.body);

    const row = await prisma.cancellation.findUnique({ where: { id: req.params.id }, include: { case: true } });
    if (!row) throw notFound('Request not found.');
    if (row.status !== 'PENDING') throw conflict('This request has already been decided.');

    const updated = await prisma.cancellation.update({
      where: { id: row.id },
      data: {
        status: body.approve ? 'APPROVED' : 'REJECTED',
        approvedById: req.user!.id,
        decisionNote: body.note,
        decidedAt: new Date(),
        refundAmount: body.refundAmount ?? row.refundAmount,
        forfeitAmount: body.forfeitAmount ?? row.forfeitAmount,
      },
    });

    if (body.approve) {
      const status = row.type === 'RESUMPTION' ? CASE_STATUS.RESUMED : CASE_STATUS.CANCELLED;
      await prisma.case.update({
        where: { id: row.caseId },
        data: { status, closedAt: new Date(), slaDueAt: null },
      });
      await prisma.stageInstance.updateMany({
        where: { caseId: row.caseId, status: STAGE_INSTANCE_STATUS.ACTIVE },
        data: { status: STAGE_INSTANCE_STATUS.COMPLETED, completedAt: new Date() },
      });

      // Book the refund and the forfeiture so the financial record balances.
      if (updated.refundAmount > 0) {
        await prisma.payment.create({
          data: {
            caseId: row.caseId,
            type: 'REFUND',
            label: `Refund on ${row.type.toLowerCase()}`,
            amount: updated.refundAmount,
            dueDate: new Date(),
            status: 'PENDING',
            note: body.note,
          },
        });
      }
      if (updated.forfeitAmount > 0) {
        await prisma.payment.updateMany({
          where: { caseId: row.caseId, type: 'EMD', status: 'PAID' },
          data: { status: 'FORFEITED' },
        });
      }
      // The plot returns to the inventory.
      if (row.case.plotId) {
        await prisma.plot.update({ where: { id: row.case.plotId }, data: { availability: 'AVAILABLE' } });
      }
      if (row.type === 'RESUMPTION') {
        await prisma.complianceRecord.updateMany({ where: { caseId: row.caseId }, data: { status: 'RESUMED' } });
      }
    } else {
      await prisma.case.update({ where: { id: row.caseId }, data: { status: CASE_STATUS.IN_PROGRESS } });
    }

    await audit(req, {
      action: body.approve ? 'CANCELLATION_APPROVED' : 'CANCELLATION_REJECTED',
      entity: 'Cancellation',
      entityId: row.id,
      caseCode: row.case.code,
      summary: `${row.type} ${body.approve ? 'approved' : 'rejected'} — ${body.note}`,
      before: { status: row.status },
      after: { status: updated.status, refund: updated.refundAmount, forfeit: updated.forfeitAmount },
    });

    const investor = await prisma.case.findUnique({
      where: { id: row.caseId },
      select: { applicant: { select: { contactUserId: true } } },
    });
    await notify({
      userIds: investor?.applicant.contactUserId ? [investor.applicant.contactUserId] : [],
      roleKeys: [ROLES.FINANCE_OFFICER],
      type: 'CANCELLATION_DECIDED',
      title: `${row.case.code} — ${row.type.toLowerCase()} ${updated.status.toLowerCase()}`,
      message: `${body.note} Refund ₹${updated.refundAmount.toLocaleString('en-IN')}, forfeited ₹${updated.forfeitAmount.toLocaleString('en-IN')}.`,
      caseId: row.caseId,
      link: `/cases/${row.caseId}`,
    });

    res.json(updated);
  })
);
