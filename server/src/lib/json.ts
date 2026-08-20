/** SQLite stores structured blobs as text; these keep the parse/stringify safe. */

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Shallow before/after diff used by the audit log. */
export function diff(before: Record<string, any>, after: Record<string, any>) {
  const changedBefore: Record<string, any> = {};
  const changedAfter: Record<string, any> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    const a = before?.[key];
    const b = after?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changedBefore[key] = a ?? null;
      changedAfter[key] = b ?? null;
    }
  }
  return { before: changedBefore, after: changedAfter };
}
