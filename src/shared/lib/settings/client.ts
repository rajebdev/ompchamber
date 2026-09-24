/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side chamber settings. SQLite is the single source of truth: the
 * server reads `app_settings` and injects the whole map into the page as
 * `window.__OMP_BOOTSTRAP__.appSettings`, and every write POSTs back to
 * `/api/settings`.
 *
 * There is deliberately no localStorage. An in-memory snapshot — primed once
 * from the bootstrap — keeps reads synchronous, so a theme flip or transport
 * change applies to the next render without waiting for a loader round-trip,
 * while the durable copy lives in SQLite and survives a reload.
 *
 * Reads are flat: top-level `app_settings` keys (`omp_sidebar_sort`,
 * `desktopLayoutSizes`, …) and the `omp_chamber_settings` blob (`theme`,
 * `streamTransport`, …) share one namespace, with the blob's keys overlaid.
 */

const CHAMBER_SETTINGS_KEY = 'omp_chamber_settings';

let snapshot: Record<string, any> | null = null;
let chamberBlob: Record<string, any> = {};

/**
 * Prime the snapshot from the server-injected bootstrap. Call once at boot
 * (see `main.tsx`); calling again re-primes from the same payload.
 */
export function primeChamberSettings(appSettings?: Record<string, any>): void {
  chamberBlob = { ...(appSettings?.[CHAMBER_SETTINGS_KEY] ?? {}) };
  const flat = { ...(appSettings ?? {}) };
  delete flat[CHAMBER_SETTINGS_KEY];
  snapshot = { ...flat, ...chamberBlob };
}

function current(appSettings?: Record<string, any>): Record<string, any> {
  if (!snapshot) primeChamberSettings(appSettings);
  return snapshot ?? {};
}

/**
 * Resolve one setting (or the first present of several candidate keys) from the
 * snapshot. Returns `undefined` when no candidate is present.
 */
export function readChamberSetting<T>(
  keys: string | string[],
  appSettings?: Record<string, any>,
): T | undefined {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const source = current(appSettings);
  for (const key of keyList) {
    if (source[key] !== undefined) return source[key] as T;
  }
  return undefined;
}

/**
 * `defaults` layered under the `omp_chamber_settings` blob only. Used to seed
 * the settings-editor state, so unrelated top-level keys must not leak in and
 * get written back into the blob.
 */
export function mergeChamberSettings<T extends Record<string, any>>(
  defaults: T,
  appSettings?: Record<string, any>,
): T {
  current(appSettings);
  return { ...defaults, ...chamberBlob };
}

/** Write one top-level `app_settings` key: snapshot first, then SQLite. */
export function writeSetting(key: string, value: unknown): void {
  snapshot = { ...current(), [key]: value };
  sendSettings({ [key]: value });
}

/**
 * Write a patch of chamber-blob keys (`theme`, `streamTransport`, …). The
 * snapshot exposes the blob's keys flat, so an edit applies to the next read
 * without a round-trip.
 *
 * Only the patch travels, and the server merges it into the stored blob. The
 * whole local blob must not be republished: this page's copy was taken when it
 * booted, so a tab left open across an external change (a second tab, a direct
 * API call) would overwrite the newer keys with its own stale ones on the next
 * unrelated write — which is exactly how a theme chosen elsewhere reverted.
 */
export function writeChamberSettings(patch: Record<string, any>): void {
  chamberBlob = { ...chamberBlob, ...patch };
  snapshot = { ...current(), ...patch };
  sendSettings({ [CHAMBER_SETTINGS_KEY]: patch });
}

/** POST a settings patch to SQLite. Fire-and-forget; failures are non-fatal. */
function sendSettings(patch: Record<string, unknown>): void {
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).catch(() => {});
}
