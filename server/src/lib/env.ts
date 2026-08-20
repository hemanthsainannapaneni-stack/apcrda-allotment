import dotenv from 'dotenv';
import path from 'node:path';

// server/.env wins, then the repo-root .env.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}
function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  port: num('PORT', 4000),
  clientOrigin: str('CLIENT_ORIGIN', 'http://localhost:5173'),
  databaseUrl: str('DATABASE_URL', 'file:./dev.db'),

  accessSecret: str('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  refreshSecret: str('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  accessTtl: str('ACCESS_TOKEN_TTL', '30m'),
  refreshTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 7),
  rememberMeTtlDays: num('REMEMBER_ME_TTL_DAYS', 30),
  maxFailedLogins: num('MAX_FAILED_LOGINS', 5),
  lockoutMinutes: num('LOCKOUT_MINUTES', 15),

  storageDriver: str('STORAGE_DRIVER', 'local'),
  uploadDir: path.resolve(__dirname, '../../', str('UPLOAD_DIR', './uploads')),
  maxUploadMb: num('MAX_UPLOAD_MB', 15),

  mailDriver: str('MAIL_DRIVER', 'console'),
  mailFrom: str('MAIL_FROM', 'APCRDA Portal <no-reply@apcrda.demo>'),
};

if (env.isProd) {
  for (const [key, value] of [
    ['JWT_ACCESS_SECRET', env.accessSecret],
    ['JWT_REFRESH_SECRET', env.refreshSecret],
  ] as const) {
    if (value.includes('change-me')) {
      throw new Error(`${key} still holds the demo default. Set a real secret before running in production.`);
    }
  }
}
