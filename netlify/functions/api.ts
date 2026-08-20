import serverless from 'serverless-http';
import type { Handler } from '@netlify/functions';
import { app } from '../../server/src/app';

/**
 * Runs the whole Express API as a single Netlify Function.
 *
 * netlify.toml rewrites /api/* to this function and Netlify passes the original
 * request path through, so the Express routes (/api/auth/login and so on) match
 * without rewriting. The hook below only matters when the function is called
 * directly at its /.netlify/functions/api URL.
 */
const wrapped = serverless(app, {
  request: (request: any) => {
    const prefix = '/.netlify/functions/api';
    if (typeof request.url === 'string' && request.url.startsWith(prefix)) {
      request.url = request.url.slice(prefix.length) || '/';
    }
  },
});

export const handler: Handler = async (event, context) => {
  // Return as soon as the response is written; otherwise the open Prisma
  // connection keeps the invocation alive until it times out.
  context.callbackWaitsForEmptyEventLoop = false;
  return (await wrapped(event, context)) as any;
};
