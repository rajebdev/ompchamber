/** Pure formatters for the Settings → Usage panel. */

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('id-ID');

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatRp(value: number): string {
  return rupiahFormatter.format(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Formats an RFC 3339 timestamp in the local timezone; falls back to the raw string. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeFormatter.format(date);
}

/** Percentage of `used` out of `total`, clamped to 0–100 for progress bars. */
export function usedPercent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

export function formatPercent(used: number, total: number): string {
  if (total <= 0) return '0%';
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format((used / total) * 100)}%`;
}

/** Formats a numeric string returned by the DeepSeek balance API. */
export function formatAmount(value: string): string {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed)) return value;
  return formatNumber(parsed);
}
