/**
 * Format a raw token count into a compact human label (e.g. 131072 → "128K",
 * 1048576 → "1M"). Strings are passed through unchanged (already formatted).
 */
export function formatContextWindow(value: number | string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value) || value <= 0) return undefined;

  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(value);
}
