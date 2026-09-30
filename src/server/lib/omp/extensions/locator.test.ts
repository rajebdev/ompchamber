/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The extension locator and its spawn environment.
 *
 * Two failure modes are pinned here, both silent in production:
 *
 *  - a locator that resolves nothing would spawn a child with NO mode extension,
 *    so the composer's toggles would report success and change nothing;
 *  - a `CHAMBER_MODES` value that omits the auto-continue flag would restore
 *    goal mode but never let it continue past the first turn.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chamberExtensionArgs, chamberExtensionEntry, chamberModeEnv } from '@/server/lib/omp/extensions/locator';

describe('chamberExtensionEntry', () => {
  test('resolves to a real file in this checkout', () => {
    const entry = chamberExtensionEntry();
    expect(entry).not.toBeNull();
    expect(existsSync(entry as string)).toBe(true);
    expect(entry?.endsWith('chamber-modes/index.ts')).toBe(true);
  });

  test('the spawn args load it with -e', () => {
    const args = chamberExtensionArgs();
    expect(args[0]).toBe('-e');
    expect(existsSync(args[1])).toBe(true);
  });
});

describe('chamberModeEnv', () => {
  test('names only the modes that are on', () => {
    expect(chamberModeEnv({ plan: true, goal: false })).toEqual({ CHAMBER_MODES: 'plan' });
    expect(chamberModeEnv({ plan: false, goal: false })).toEqual({ CHAMBER_MODES: '' });
  });

  test('goal mode turns on automatic continuation', () => {
    // Without the flag the restored goal would run one turn and stop, which is
    // the behaviour the feature exists to avoid.
    const env = chamberModeEnv({ plan: false, goal: true });
    expect(env.CHAMBER_MODES).toBe('goal');
    expect(env.CHAMBER_GOAL_AUTO_CONTINUE).toBe('1');
  });

  test('plan-only does NOT turn on continuation', () => {
    expect(chamberModeEnv({ plan: true, goal: false }).CHAMBER_GOAL_AUTO_CONTINUE).toBeUndefined();
  });
});
