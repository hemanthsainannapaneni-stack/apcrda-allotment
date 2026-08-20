#!/usr/bin/env node
/**
 * Switch the Prisma datasource provider between sqlite (zero-infra demo default)
 * and postgresql (the production path used by docker-compose).
 *
 * Prisma requires the datasource `provider` to be a literal, so we rewrite it.
 *   node scripts/use-db.mjs postgresql
 *   node scripts/use-db.mjs sqlite
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const target = process.argv[2];
if (!['sqlite', 'postgresql'].includes(target)) {
  console.error('Usage: node scripts/use-db.mjs <sqlite|postgresql>');
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaPath = join(root, 'server', 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');
const next = schema.replace(/provider = "(sqlite|postgresql)"/, `provider = "${target}"`);

if (next === schema) {
  console.log(`Datasource provider already set to "${target}".`);
} else {
  writeFileSync(schemaPath, next);
  console.log(`Datasource provider switched to "${target}".`);
}

console.log(
  target === 'postgresql'
    ? 'Set DATABASE_URL to your Postgres URL (see .env.example), then run: npm run db:push && npm run seed'
    : 'Set DATABASE_URL="file:./dev.db" (see .env.example), then run: npm run db:push && npm run seed'
);
