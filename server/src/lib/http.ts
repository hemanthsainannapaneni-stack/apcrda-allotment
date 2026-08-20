import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (m: string, d?: unknown) => new ApiError(400, m, d);
export const unauthorized = (m = 'Authentication required') => new ApiError(401, m);
export const forbidden = (m = 'You do not have permission to perform this action') => new ApiError(403, m);
export const notFound = (m = 'Not found') => new ApiError(404, m);
export const conflict = (m: string) => new ApiError(409, m);

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wraps async handlers so rejections reach the error middleware. */
export const asyncHandler =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'A record with that unique value already exists.' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found.' });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is larger than the configured upload limit.' });
  }

  // A misconfigured or unreachable database is an operational problem, not a
  // bug in the request. Saying so beats "Internal server error", which gives a
  // deployer nothing to act on.
  const infra = describeInfrastructureFailure(err);
  if (infra) {
    // eslint-disable-next-line no-console
    console.error('[database]', err?.message ?? err);
    return res.status(503).json({ error: infra.message, hint: infra.hint, check: '/health' });
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Internal server error' });
}

/** Recognises the Prisma failures that mean "the deployment is not set up". */
function describeInfrastructureFailure(err: any): { message: string; hint: string } | null {
  const name = err?.name ?? '';
  const code = err?.code ?? err?.errorCode ?? '';
  const text = String(err?.message ?? '');

  if (name === 'PrismaClientInitializationError' || code === 'P1000' || code === 'P1001' || code === 'P1017') {
    if (/must start with the protocol|Environment variable not found|not found: DATABASE_URL/i.test(text)) {
      return {
        message: 'The server has no database configured, so it cannot sign anyone in.',
        hint: 'Set DATABASE_URL in the hosting environment and redeploy.',
      };
    }
    if (code === 'P1000' || /Authentication failed/i.test(text)) {
      return {
        message: 'The server could not authenticate against its database.',
        hint: 'Check the username and password in DATABASE_URL.',
      };
    }
    return {
      message: 'The server cannot reach its database.',
      hint: 'Check the database is running and that DATABASE_URL points at it. A sleeping free-tier database may need a moment to wake.',
    };
  }

  // Connected, but the tables were never created.
  if (code === 'P2021' || code === 'P2022' || /does not exist in the current database/i.test(text)) {
    return {
      message: 'The database is reachable but its tables have not been created yet.',
      hint: 'Run `npm run db:push` and then `npm run seed` against this database.',
    };
  }

  if (name === 'PrismaClientValidationError' && /DATABASE_URL/i.test(text)) {
    return {
      message: 'The database connection string is not valid.',
      hint: 'Check the DATABASE_URL value in the hosting environment.',
    };
  }

  return null;
}

export function pageParams(query: Record<string, any>, defaultSize = 20) {
  const page = Math.max(1, Number(query.page) || 1);
  const rawSize = Number(query.pageSize) || defaultSize;
  const pageSize = Math.min(200, Math.max(1, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
