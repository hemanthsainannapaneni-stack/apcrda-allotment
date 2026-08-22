import clsx from 'clsx';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, HelpCircle, Info, Loader2, X, XCircle } from 'lucide-react';
import { GLOSSARY, plainStatus } from '../lib/plain';

export const cn = clsx;

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: ReactNode;
};

const VARIANTS: Record<string, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 disabled:bg-navy-300',
  secondary: 'bg-navy-100 text-navy-900 hover:bg-navy-200 disabled:opacity-50',
  outline: 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 disabled:opacity-50',
  ghost: 'text-ink-600 hover:bg-ink-100 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-300',
};

const SIZES: Record<string, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
  icon: 'h-9 w-9',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg border border-ink-200 bg-white shadow-card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink-200 px-4 py-2.5',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Badges & status
// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-navy-50 text-navy-800 ring-navy-200',
  muted: 'bg-ink-50 text-ink-500 ring-ink-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** One place that decides what colour a domain status is. */
export function toneForStatus(status?: string | null): Tone {
  switch (status) {
    case 'COMPLETED':
    case 'PAID':
    case 'RESOLVED':
    case 'APPROVED':
    case 'SANCTIONED':
    case 'GOOD_STANDING':
    case 'CLEARED':
      return 'success';
    case 'IN_PROGRESS':
    case 'ACTIVE':
    case 'UNDER_REVIEW':
    case 'SUBMITTED':
    case 'UNDER_SCRUTINY':
      return 'info';
    case 'ON_HOLD':
    case 'PENDING':
    case 'RETURNED':
    case 'DEFERRED':
    case 'AT_RISK':
    case 'BREACH_NOTICE':
    case 'CURE_PERIOD':
    case 'OVERDUE':
    case 'DELAYED':
    case 'OPEN':
      return 'warning';
    case 'REJECTED':
    case 'LAPSED':
    case 'CANCELLED':
    case 'RESUMED':
    case 'FORFEITED':
    case 'SUSPENDED':
      return 'danger';
    case 'DRAFT':
    case 'UPCOMING':
    case 'SKIPPED':
    case 'NOT_STARTED':
    case 'NOT_APPLICABLE':
      return 'muted';
    default:
      return 'neutral';
  }
}

export function StatusBadge({
  status,
  className,
  raw,
}: {
  status?: string | null;
  className?: string;
  /** Show the official value instead of the plain-English one. */
  raw?: boolean;
}) {
  if (!status) return <span className="text-ink-400">—</span>;
  const plain = plainStatus(status);
  const official = status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return (
    <span title={plain.help ? `${official} — ${plain.help}` : official}>
      <Badge tone={toneForStatus(status)} className={className}>
        {raw ? official : plain.label}
      </Badge>
    </span>
  );
}

/**
 * An official term with its plain-English meaning on hover. Used for the
 * acronyms this domain cannot avoid (DPR, LOI, LASC, EMD, FSI …).
 */
export function Term({ children, k }: { children?: ReactNode; k: string }) {
  const meaning = GLOSSARY[k];
  if (!meaning) return <>{children ?? k}</>;
  return (
    <abbr
      title={meaning}
      className="cursor-help border-b border-dotted border-ink-400 no-underline"
    >
      {children ?? k}
    </abbr>
  );
}

/**
 * Progressive disclosure: the default view stays calm, and anyone who wants the
 * full detail is one click away from it.
 */
export function MoreDetail({
  label = 'Show more detail',
  hideLabel,
  children,
  defaultOpen = false,
}: {
  label?: string;
  hideLabel?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 hover:underline"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? hideLabel ?? 'Hide detail' : label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** A short explanation shown beside a heading, for people new to the process. */
export function Explain({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cn('input-base', props.className)} />
);

export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...props} className={cn('input-base resize-y', props.className)} />
);

export function Select({
  options,
  placeholder,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select {...rest} className={cn('input-base pr-8', rest.className)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2 text-sm', disabled && 'cursor-not-allowed opacity-60')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-ink-300 text-navy-700 focus:ring-navy-500"
      />
      <span className="text-ink-700">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-ink-300">{icon}</div>}
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {description && <p className="max-w-md text-xs text-ink-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: any; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <XCircle className="h-6 w-6 text-red-500" />
      <p className="text-sm font-semibold text-ink-800">Something went wrong</p>
      <p className="max-w-md text-xs text-ink-500">{error?.message ?? 'Unexpected error.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: ReactNode;
  children?: ReactNode;
}) {
  const map = {
    info: { cls: 'border-navy-200 bg-navy-50 text-navy-900', Icon: Info },
    warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
    danger: { cls: 'border-red-200 bg-red-50 text-red-900', Icon: XCircle },
    success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  }[tone];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs', map.cls)}>
      <map.Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'leading-relaxed')}>{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type Toast = { id: number; tone: 'success' | 'error' | 'info'; message: string };
const ToastContext = createContext<{ push: (tone: Toast['tone'], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const next = useRef(1);

  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = next.current++;
    setItems((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs shadow-pop',
              t.tone === 'success' && 'border-emerald-200 bg-white text-emerald-900',
              t.tone === 'error' && 'border-red-200 bg-white text-red-900',
              t.tone === 'info' && 'border-navy-200 bg-white text-navy-900'
            )}
          >
            {t.tone === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
            {t.tone === 'error' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
            {t.tone === 'info' && <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" />}
            <span className="min-w-0 flex-1 leading-relaxed">{t.message}</span>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-ink-400 hover:text-ink-600"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return {
    success: (m: string) => ctx.push('success', m),
    error: (m: string) => ctx.push('error', m),
    info: (m: string) => ctx.push('info', m),
  };
}

// ---------------------------------------------------------------------------
// Modal & confirm
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn('relative w-full rounded-lg bg-white shadow-pop', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-ink-400 hover:bg-ink-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-600">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tables & pagination
// ---------------------------------------------------------------------------

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full min-w-[640px] border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  align,
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-ink-200 bg-ink-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-500',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align,
  colSpan,
  title,
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
  title?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      className={cn(
        'border-b border-ink-100 px-3 py-2.5 align-middle text-ink-700',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className
      )}
    >
      {children}
    </td>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-4 py-2.5 text-xs text-ink-500">
      <span>
        Page <strong className="text-ink-700">{page}</strong> of {totalPages} · {total.toLocaleString('en-IN')} record
        {total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="no-print flex gap-1 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition-colors',
            active === t.key
              ? 'border-navy-700 text-navy-900'
              : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-700'
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink-800">{children}</dd>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const accent: Record<Tone, string> = {
    neutral: 'text-ink-800',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
    info: 'text-navy-800',
    muted: 'text-ink-500',
  };
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'rounded-lg border border-ink-200 bg-white p-3.5 text-left shadow-card',
        onClick && 'transition-shadow hover:shadow-pop'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', accent[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>}
    </Wrapper>
  );
}

export function ProgressBar({ value, tone = 'info' }: { value: number; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  const colours = {
    info: 'bg-navy-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-500',
    danger: 'bg-red-600',
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-200">
      <div
        className={cn('h-full rounded-full transition-all', colours[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
