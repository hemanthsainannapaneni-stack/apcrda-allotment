import type { Handler } from '@netlify/functions';
import { runSweeps } from '../../server/src/workflow/sweeps';
import { prisma } from '../../server/src/lib/prisma';

/**
 * The long-running server runs the time-driven rules on an hourly interval.
 * A serverless deployment has no process to hold that timer, so Netlify's
 * scheduler calls this instead (see the [functions."sweeps"] schedule in
 * netlify.toml).
 *
 * Covers: LOI expiry warnings and lapses, overdue payment penalties,
 * commencement deadlines and breach notices, and SLA breach alerts.
 */
export const handler: Handler = async (_event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    const result = await runSweeps();
    // eslint-disable-next-line no-console
    console.log('[sweeps]', result);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[sweeps] failed', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: (err as Error).message }) };
  } finally {
    await prisma.$disconnect();
  }
};
