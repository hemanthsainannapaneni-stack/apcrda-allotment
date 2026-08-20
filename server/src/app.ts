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

/**
 * Health check. When the database is unreachable this has to say *why* —
 * "database unavailable" alone is not enough to debug a deployment. Credentials
 * are stripped from everything reported here.
 */
app.get('/health', async (_req, res) => {
  const database = describeDatabase();
  const base = { service: 'apcrda-land-allotment-api', time: new Date().toISOString(), database };

  if (!database.configured) {
    return res.status(503).json({
      ...base,
      ok: false,
      error: 'DATABASE_URL is not set',
      hint: 'Add DATABASE_URL to the environment variables of whatever is hosting the API, then redeploy.',
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ ...base, ok: true });
  } catch (err: any) {
    return res.status(503).json({
      ...base,
      ok: false,
      error: 'database unavailable',
      reason: redact(err?.message ?? String(err)),
      code: err?.errorCode ?? err?.code ?? null,
      hint: hintFor(database),
    });
  }
});

type DatabaseInfo = {
  configured: boolean;
  provider?: string;
  host?: string;
  name?: string;
  pooled?: boolean;
  sslmode?: string | null;
  invalid?: boolean;
};

/** Connection details with the credentials removed, for diagnostics. */
function describeDatabase(): DatabaseInfo {
  const raw = process.env.DATABASE_URL ?? '';
  if (!raw) return { configured: false };
  try {
    const url = new URL(raw);
    return {
      configured: true,
      provider: url.protocol.replace(':', ''),
      host: url.host,
      name: url.pathname.replace(/^\//, '') || undefined,
      pooled: /-pooler\./.test(url.hostname),
      sslmode: url.searchParams.get('sslmode'),
    };
  } catch {
    return { configured: true, invalid: true };
  }
}

function hintFor(db: DatabaseInfo) {
  if (db.invalid) return 'DATABASE_URL is not a valid connection string.';
  if (db.provider === 'file') {
    return 'DATABASE_URL points at a SQLite file. A serverless function has no persistent disk — use a hosted Postgres database.';
  }
  if (db.host?.includes('neon.tech') && !db.pooled) {
    return 'Neon: use the pooled connection string (the host contains "-pooler") for serverless, and make sure sslmode=require is set.';
  }
  if (db.sslmode === null) {
    return 'Most hosted Postgres providers require SSL. Try appending ?sslmode=require to DATABASE_URL.';
  }
  return 'Check the database is running and reachable, and that the schema has been pushed (npm run db:push).';
}

/** Never echo a password back, even in an error message. */
function redact(message: string) {
  return message
    .replace(/\/\/[^:@\s/]+:[^@\s/]+@/g, '//***:***@')
    .replace(/(password|pgpassword)=([^\s&;]+)/gi, '$1=***')
    .slice(0, 400);
}

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
