import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env } from './lib/env';
import { errorHandler, notFound } from './lib/http';
import { prisma } from './lib/prisma';
import { requireAuth, blockReadOnly } from './middleware/auth';

import { authRouter } from './routes/auth';
import { metaRouter } from './routes/meta';
import { casesRouter } from './routes/cases';
import { applicantsRouter } from './routes/applicants';
import { plotsRouter, invitationsRouter } from './routes/plots';
import { documentsRouter } from './routes/documents';
import { paymentsRouter } from './routes/payments';
import { grievancesRouter } from './routes/grievances';
import { cancellationsRouter } from './routes/cancellations';
import { constructionRouter } from './routes/construction';
import { dashboardRouter } from './routes/dashboard';
import { notificationsRouter } from './routes/notifications';
import { usersRouter, rolesRouter } from './routes/users';
import { settingsRouter, workflowRouter } from './routes/settings';
import { auditRouter } from './routes/audit';
import { reportsRouter } from './routes/reports';

const app = express();

// When the API and the frontend are served from one origin (the Netlify
// deployment), there is no cross-origin request to allow. CLIENT_ORIGIN may
// also be "*" to accept any origin, which suits a public demo.
const allowedOrigins = env.clientOrigin.split(',').map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'apcrda-land-allotment-api', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

app.use('/api/auth', authRouter);

// Everything below requires a session. Viewer/Auditor is read-only across the board.
const api = express.Router();
api.use(requireAuth, blockReadOnly);

api.use('/meta', metaRouter);
api.use('/dashboard', dashboardRouter);
api.use('/cases', casesRouter);
api.use('/applicants', applicantsRouter);
api.use('/plots', plotsRouter);
api.use('/invitations', invitationsRouter);
api.use('/documents', documentsRouter);
api.use('/payments', paymentsRouter);
api.use('/grievances', grievancesRouter);
api.use('/cancellations', cancellationsRouter);
api.use('/construction', constructionRouter);
api.use('/notifications', notificationsRouter);
api.use('/users', usersRouter);
api.use('/roles', rolesRouter);
api.use('/settings', settingsRouter);
api.use('/workflow', workflowRouter);
api.use('/audit', auditRouter);
api.use('/reports', reportsRouter);

app.use('/api', api);

// Uploaded files are served through the documents route (which enforces access),
// but the demo also exposes the folder for convenience in development.
if (!env.isProd) {
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));
}

app.use((_req, _res, next) => next(notFound('No such API route.')));
app.use(errorHandler);

export default app;
export { app };
