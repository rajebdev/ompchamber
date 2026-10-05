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

/** `app_settings` key holding the disabled plugin ids. */
const PANEL_PLUGINS_KEY = 'omp_panel_plugins';

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

/** The ids switched off, in the order they were written. */
export async function readDisabledPlugins(): Promise<string[]> {
  const db = await getDb();
  return normalize(await readSettingsJson<unknown>(db, PANEL_PLUGINS_KEY, EMPTY)).disabled;
}

/**
 * Switch a plugin on or off, answering with the resulting disabled set.
 *
 * Idempotent by construction — the id is added or removed from a set rather
 * than toggled — so a double-click cannot leave the plugin in the state the
 * user did not ask for.
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<string[]> {
  const current = await readDisabledPlugins();
  const next = enabled
    ? current.filter((id) => id !== pluginId)
    : current.includes(pluginId)
      ? current
      : [...current, pluginId];
  const db = await getDb();
  await writeSettingsJson(db, PANEL_PLUGINS_KEY, { disabled: next } satisfies PanelPluginState);
  return next;
}
