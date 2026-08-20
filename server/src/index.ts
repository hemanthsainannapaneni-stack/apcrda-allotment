import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { app } from './app';
import { runSweeps } from './workflow/sweeps';

/**
 * Long-running server entry point. The Express app itself lives in app.ts so it
 * can also be wrapped as a serverless function (see netlify/functions/api.ts),
 * where there is no process to keep alive and no interval timer.
 */
const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`\n  APCRDA Land Allotment API`);
  // eslint-disable-next-line no-console
  console.log(`  http://localhost:${env.port}  ·  env=${env.nodeEnv}  ·  client=${env.clientOrigin}\n`);
  void bootSweeps();
});

async function bootSweeps() {
  const tick = async () => {
    try {
      const result = await runSweeps();
      const changed = Object.values(result).some((v) => v > 0);
      // eslint-disable-next-line no-console
      if (changed) console.log('[sweeps]', result);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sweeps] failed', err);
    }
  };
  await tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  });
}
