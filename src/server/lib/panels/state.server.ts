/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which installed panel plugins are switched ON.
 *
 * Enablement is separate from installation on purpose: a plugin's files can be
 * on disk while it contributes nothing — no activity-bar button, no header
 * button, no editor tab — and that is the state a user reaches by switching a
 * plugin off rather than deleting it. Deleting is `removePanelPlugin`; this
 * only flips a flag.
 *
 * The flag lives in the chamber's own `app_settings` rather than in the
 * marketplace directory, because it is CHAMBER state: the plugin's files are a
 * third-party repository whose format the chamber does not own, and writing a
 * chamber preference into it would be a file the plugin's own tooling could
 * rewrite.
 *
 * Stored as the DISABLED set, not an enabled set. Absent means enabled, which
 * is what makes a freshly installed plugin live immediately and what keeps a
 * database written before this feature existed from switching every plugin off.
 */

import { getDb } from '@/server/db.server';
import { readSettingsJson, writeSettingsJson } from '@/server/lib/db/settings-store';
import { emitRealtimeSignal } from '@/server/lib/realtime/signals.server';

/** `app_settings` key holding the disabled plugin ids. */
const PANEL_PLUGINS_KEY = 'omp_panel_plugins';

/** The chamber settings blob, which used to hold the HIDDEN panel ids. */
const CHAMBER_SETTINGS_KEY = 'omp_chamber_settings';

interface PanelPluginState {
  /** Plugin ids whose contributions are switched off. */
  disabled: string[];
}

const EMPTY: PanelPluginState = { disabled: [] };

function normalize(raw: unknown): PanelPluginState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY;
  if (!('disabled' in raw)) return EMPTY;
  const list = raw.disabled;
  if (!Array.isArray(list)) return EMPTY;
  return { disabled: list.filter((id): id is string => typeof id === 'string' && id.length > 0) };
}

/**
 * Fold the retired `hiddenRightPanels` list into the disabled set, once.
 *
 * Hiding a panel and disabling it were two different things with two different
 * stores, and hiding was the built-ins' only axis. There is now ONE axis and one
 * store, so a list of hidden ids has to become a list of disabled ones or a view
 * the user had switched off would come back on their next load.
 *
 * The migration is guarded by the PRESENCE of the old key rather than by a
 * marker, and it deletes the key as it goes: a marker would leave the list in
 * place for a database that migrated under an older build, and deleting it is
 * what makes the pass idempotent — a second read finds nothing to fold, so a
 * value written afterwards cannot be re-adopted. Values already in the disabled
 * set win: they are the newer store.
 */
async function migrateHiddenPanels(state: PanelPluginState): Promise<PanelPluginState> {
  const db = await getDb();
  const blob = await readSettingsJson<Record<string, unknown>>(db, CHAMBER_SETTINGS_KEY, {});
  const hidden = blob.hiddenRightPanels;
  if (!Array.isArray(hidden)) return state;

  const { hiddenRightPanels: _retired, ...rest } = blob;
  const merged = new Set(state.disabled);
  for (const id of hidden) {
    if (typeof id === 'string' && id.length > 0) merged.add(id);
  }

  await writeSettingsJson(db, CHAMBER_SETTINGS_KEY, rest);
  const next = { disabled: [...merged] };
  await writeSettingsJson(db, PANEL_PLUGINS_KEY, next);
  return next;
}

/** The ids switched off, in the order they were written. */
export async function readDisabledPlugins(): Promise<string[]> {
  const db = await getDb();
  const stored = normalize(await readSettingsJson<unknown>(db, PANEL_PLUGINS_KEY, EMPTY));
  return (await migrateHiddenPanels(stored)).disabled;
}

/**
 * Switch a plugin on or off, answering with the resulting disabled set.
 *
 * Idempotent by construction — the id is added or removed from a set rather
 * than toggled — so a double-click cannot leave the plugin in the state the
 * user did not ask for.
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<string[]> {
  // The `panels` topic is republished from here rather than at each route: a
  // switch flipped in one tab must move every other tab's catalog, and this is
  // the one writer of that state.
  const current = await readDisabledPlugins();
  const next = enabled
    ? current.filter((id) => id !== pluginId)
    : current.includes(pluginId)
      ? current
      : [...current, pluginId];
  const db = await getDb();
  await writeSettingsJson(db, PANEL_PLUGINS_KEY, { disabled: next } satisfies PanelPluginState);
  emitRealtimeSignal('panels-changed');
  return next;
}
