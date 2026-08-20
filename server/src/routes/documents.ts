import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/http';
import { audit } from '../lib/audit';
import { storage, uploader } from '../lib/storage';
import { assertCaseAccess, blockReadOnly, isInvestor } from '../middleware/auth';

export const documentsRouter = Router();

documentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const caseId = String(req.query.caseId ?? '');
    if (!caseId) throw badRequest('caseId is required.');
    await assertCaseAccess(req, caseId);

    const where: any = { caseId };
    if (isInvestor(req)) where.visibility = 'INVESTOR';
    if (req.query.stageId) where.stageId = String(req.query.stageId);
    if (req.query.type) where.type = String(req.query.type);

    const rows = await prisma.document.findMany({
      where,
      orderBy: [{ uploadedAt: 'desc' }],
      include: { uploadedBy: { select: { name: true, roleKey: true } }, stage: { select: { code: true, name: true } } },
    });
    res.json(rows);
  })
);

documentsRouter.post(
  '/',
  blockReadOnly,
  uploader('cases').single('file'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        caseId: z.string().min(1),
        stageId: z.string().optional().nullable(),
        type: z.string().min(1),
        visibility: z.enum(['INTERNAL', 'INVESTOR']).optional(),
      })
      .parse(req.body);

    await assertCaseAccess(req, body.caseId);
    if (!req.file) throw badRequest('No file was uploaded.');

    const stored = await storage.save(req.file, 'cases');

    // Same type on the same case bumps the version rather than overwriting.
    const previous = await prisma.document.findFirst({
      where: { caseId: body.caseId, type: body.type },
      orderBy: { version: 'desc' },
    });

    const row = await prisma.document.create({
      data: {
        caseId: body.caseId,
        stageId: body.stageId || null,
        type: body.type,
        name: stored.name,
        version: (previous?.version ?? 0) + 1,
        fileUrl: stored.url,
        mimeType: stored.mimeType,
        size: stored.size,
        visibility: isInvestor(req) ? 'INVESTOR' : body.visibility ?? 'INTERNAL',
        uploadedById: req.user!.id,
      },
      include: { uploadedBy: { select: { name: true, roleKey: true } } },
    });

    const caseRow = await prisma.case.findUnique({ where: { id: body.caseId }, select: { code: true } });
    await audit(req, {
      action: 'DOCUMENT_UPLOADED',
      entity: 'Document',
      entityId: row.id,
      caseCode: caseRow?.code ?? '',
      summary: `${row.type} v${row.version} uploaded (${row.name})`,
      after: { type: row.type, version: row.version, name: row.name },
    });

    res.status(201).json(row);
  })
);

documentsRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const row = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Document not found.');
    if (row.caseId) await assertCaseAccess(req, row.caseId);
    if (isInvestor(req) && row.visibility !== 'INVESTOR') throw forbidden('This document is internal to APCRDA.');

    const abs = storage.resolve(row.fileUrl);
    if (!abs || !fs.existsSync(abs)) {
      throw notFound('The stored file is missing. In the seeded demo, placeholder documents have no binary content.');
    }
    res.download(abs, row.name);
  })
);
