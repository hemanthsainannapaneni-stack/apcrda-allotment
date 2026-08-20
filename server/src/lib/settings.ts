import { prisma } from './prisma';
import { parseJson } from './json';

export type SettingsMap = Record<string, any>;

let cache: { at: number; value: SettingsMap } | null = null;
const TTL_MS = 5_000;

function coerce(type: string, raw: string): any {
  switch (type) {
    case 'number':
      return Number(raw);
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'json':
    case 'list':
      return parseJson<any>(raw, type === 'list' ? [] : {});
    default:
      return raw;
  }
}

export async function getSettings(force = false): Promise<SettingsMap> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await prisma.setting.findMany();
  const map: SettingsMap = {};
  for (const row of rows) map[row.key] = coerce(row.type, row.value);
  cache = { at: Date.now(), value: map };
  return map;
}

export function invalidateSettings() {
  cache = null;
}

export async function getSetting<T = any>(key: string, fallback: T): Promise<T> {
  const all = await getSettings();
  return (all[key] ?? fallback) as T;
}
