/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The window a session with no turn yet should be measured against.
 *
 * `resolveSelectedModelContextLimit` reads the composer's persisted pick
 * (`omp_selected_model`) and resolves it against the live registry. It is the
 * fallback path only: a session whose transcript names a model keeps that
 * model's window, and this one covers the window BEFORE the first turn exists.
 *
 * Pinned here: a stored pick resolves to its model's window; a pick that no
 * longer exists in the registry resolves to null (the caller keeps the
 * historical constant rather than inventing one); and a missing or malformed
 * row resolves to null instead of throwing.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getDb, getDatabasePath } from '@/server/db.server';
import { writeSettingsJson } from '@/server/lib/db/settings-store';
import { invalidateModelsCache, loadModelsWithCache } from '@/server/lib/models/registry.server';
import { resolveSelectedModelContextLimit } from '@/server/lib/models/selected-context-limit.server';

const SELECTED_MODEL_KEY = 'omp_selected_model';

let previous: unknown = null;
let hadRow = false;

beforeAll(async () => {
  const db = await getDb();
  const row = await db.get<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [SELECTED_MODEL_KEY],
  );
  hadRow = Boolean(row);
  if (row) {
    try {
      previous = JSON.parse(row.value);
    } catch {
      previous = null;
    }
  }
});

afterAll(async () => {
  const db = await getDb();
  if (hadRow) await writeSettingsJson(db, SELECTED_MODEL_KEY, previous);
  else await db.run('DELETE FROM app_settings WHERE key = ?', [SELECTED_MODEL_KEY]);
  invalidateModelsCache();
});

/** A model the registry genuinely serves, so the lookup is a real one. */
async function firstRegistryModel(): Promise<{ provider: string; id: string; contextWindow: number }> {
  invalidateModelsCache();
  const models = await loadModelsWithCache();
  const hit = models.modelList.find((m) => typeof m.contextWindow === 'number' && m.contextWindow > 0);
  if (!hit?.contextWindow) throw new Error(`registry served no model with a context window (${await getDatabasePath()})`);
  return { provider: hit.provider, id: hit.id, contextWindow: hit.contextWindow };
}

describe('resolveSelectedModelContextLimit', () => {
  test('resolves the persisted pick to that model\'s window', async () => {
    const model = await firstRegistryModel();
    const db = await getDb();
    await writeSettingsJson(db, SELECTED_MODEL_KEY, {
      id: model.id,
      provider: model.provider,
      name: model.id,
    });

    expect(await resolveSelectedModelContextLimit()).toBe(model.contextWindow);
  });

  test('reads the `modelId` spelling as well as `id`', async () => {
    const model = await firstRegistryModel();
    const db = await getDb();
    await writeSettingsJson(db, SELECTED_MODEL_KEY, {
      modelId: model.id,
      provider: model.provider,
    });

    expect(await resolveSelectedModelContextLimit()).toBe(model.contextWindow);
  });

  test('returns null for a pick the registry no longer serves', async () => {
    const db = await getDb();
    await writeSettingsJson(db, SELECTED_MODEL_KEY, {
      id: 'model-that-does-not-exist',
      provider: 'provider-that-does-not-exist',
    });

    expect(await resolveSelectedModelContextLimit()).toBeNull();
  });

  test('returns null for a malformed row rather than throwing', async () => {
    const db = await getDb();
    await writeSettingsJson(db, SELECTED_MODEL_KEY, { provider: 'only-a-provider' });

    expect(await resolveSelectedModelContextLimit()).toBeNull();
  });
});
