import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, forbidden, notFound } from '../lib/http';
import { audit } from '../lib/audit';
import { CAPABILITIES } from '../lib/enums';
import { isInvestor, requireCapability } from '../middleware/auth';

export const applicantsRouter = Router();

applicantsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const where: any = {};
    if (isInvestor(req)) where.contactUserId = req.user!.id;
    const q = String(req.query.q ?? '').trim();
    if (q) where.name = { contains: q };

    const rows = await prisma.applicant.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 200,
      include: { _count: { select: { cases: true } } },
    });
    res.json(rows);
  })
);

const applicantSchema = z.object({
  entityType: z.string().min(1),
  name: z.string().min(2),
  promoterProfile: z.string().optional().default(''),
  netWorth: z.coerce.number().min(0).default(0),
  pan: z.string().optional().default(''),
  cin: z.string().optional().default(''),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional().default(''),
  address: z.string().optional().default(''),
  // Officers may bind an applicant profile to an investor login so that the
  // investor can act on the stages they own. Investors never set this.
  contactUserId: z.string().nullable().optional(),
});

applicantsRouter.post(
  '/',
  requireCapability(CAPABILITIES.CASES_CREATE),
  asyncHandler(async (req, res) => {
    const body = applicantSchema.parse(req.body);
    const row = await prisma.applicant.create({
      data: {
        ...body,
        contactEmail: body.contactEmail || req.user!.email,
        // An investor's profile always binds to their own login; an officer may
        // nominate the investor account that will act on the case.
        contactUserId: isInvestor(req) ? req.user!.id : body.contactUserId ?? null,
      },
    });
    await audit(req, {
      action: 'APPLICANT_CREATED',
      entity: 'Applicant',
      entityId: row.id,
      summary: `Applicant profile "${row.name}" created`,
    });
    res.status(201).json(row);
  })
);

applicantsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.applicant.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Applicant not found.');
    if (isInvestor(req) && row.contactUserId !== req.user!.id) throw forbidden('Not your applicant profile.');

    const body = applicantSchema.partial().parse(req.body);
    if (isInvestor(req)) delete body.contactUserId; // cannot reassign ownership
    const updated = await prisma.applicant.update({ where: { id: req.params.id }, data: body });
    await audit(req, {
      action: 'APPLICANT_UPDATED',
      entity: 'Applicant',
      entityId: updated.id,
      summary: `Applicant "${updated.name}" updated`,
    });
    res.json(updated);
  })
);
