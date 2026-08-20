import { PrismaClient } from '@prisma/client';
import { env } from './env';

export const prisma = new PrismaClient({
  log: env.isProd ? ['error'] : ['warn', 'error'],
});

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
