/** IST dates, INR currency, DD-MMM-YYYY throughout. */

const TZ = 'Asia/Kolkata';

export function fmtDate(value?: string | Date | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
}

export function fmtDateTime(value?: string | Date | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}`;
}

export function toInputDate(value?: string | Date | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function fmtINR(value?: number | null, opts: { compact?: boolean } = {}) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  if (opts.compact) return `₹${compactIndian(n)}`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/** Crore / lakh shorthand — how these figures are actually read in India. */
export function compactIndian(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(abs >= 1_00_00_00_000 ? 0 : 2)} Cr`;
  if (abs >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)} K`;
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtNumber(value?: number | null, digits = 0) {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function daysBetween(from?: string | Date | null, to: Date = new Date()) {
  if (!from) return 0;
  return Math.round((to.getTime() - new Date(from).getTime()) / 86_400_000);
}

export function relativeDays(value?: string | Date | null) {
  if (!value) return '—';
  const diff = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff > 0) return `in ${diff} day${diff === 1 ? '' : 's'}`;
  return `${Math.abs(diff)} day${diff === -1 ? '' : 's'} ago`;
}

/** SCREAMING_SNAKE → Title Case, for enum values shown in the UI. */
export function humanise(value?: string | null) {
  if (!value) return '—';
  if (!/[a-z]/.test(value)) {
    return value
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return value;
}

/** Skips leading initials so "K. Ramesh Babu" greets as "Ramesh". */
export function firstName(name?: string | null) {
  if (!name) return 'there';
  const parts = name.replace(/,.*$/, '').split(/\s+/).filter(Boolean);
  const real = parts.find((p) => p.replace(/\./g, '').length > 1);
  return real ?? parts[0] ?? 'there';
}

export function initials(name?: string | null) {
  if (!name) return '?';
  return name
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}
