/**
 * Tiny dependency-free semantic-version helpers for the update checker.
 * Deliberately lenient: it compares numeric dotted segments only and ignores
 * any pre-release suffix, which is all the GitHub/omp version strings need.
 */

/** Strip a leading `v`/`V` and surrounding whitespace. */
export function normalizeVersion(v: string): string {
  return v.trim().replace(/^[vV]/, '');
}

function toSegments(v: string): number[] {
  const core = normalizeVersion(v).split('-')[0] ?? '';
  return core.split('.').map((segment) => (/^\d+$/.test(segment) ? Number.parseInt(segment, 10) : 0));
}

/** Compare two versions: -1 when a < b, 0 when equal, 1 when a > b. */
export function compareVersions(a: string, b: string): number {
  const left = toSegments(a);
  const right = toSegments(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** True when `latest` is strictly newer than `current`. */
export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
