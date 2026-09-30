/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The marker parser is the boundary between the extension (which writes) and
 * the composer (which reads). A marker that fails to parse must degrade to an
 * ordinary notice, never to silence: a version skew that swallowed the message
 * would leave the user with a toggle that does nothing and no explanation.
 */

import { describe, expect, test } from 'bun:test';
import { goalEnabledFromMarker, goalRecordFromMarker, parseChamberMarker } from '@/shared/lib/omp/mode/markers';
import { CHAMBER_PLAN_STATE_MARKER } from '@/shared/lib/omp/mode/types';

describe('parseChamberMarker', () => {
  test('parses a plan-state marker', () => {
    const parsed = parseChamberMarker(`${CHAMBER_PLAN_STATE_MARKER}{"enabled":true}`);
    expect(parsed?.marker).toBe(CHAMBER_PLAN_STATE_MARKER);
    expect(parsed?.payload.enabled).toBe(true);
  });

  test('an ordinary notice is not a marker', () => {
    expect(parseChamberMarker('Reloaded omp engine')).toBeNull();
  });

  test('a marker with a broken payload is not a marker', () => {
    // Rendered as a notice instead: the alternative is a silent drop.
    expect(parseChamberMarker(`${CHAMBER_PLAN_STATE_MARKER}{truncated`)).toBeNull();
  });

  test('a marker whose payload is not an object is not a marker', () => {
    expect(parseChamberMarker(`${CHAMBER_PLAN_STATE_MARKER}"text"`)).toBeNull();
  });

  test('the longest marker wins', () => {
    // CHAMBER_PLAN_STATE: is a prefix of CHAMBER_PLAN_STATE_MARKER, so an
    // unordered table would resolve the longer one to the shorter.
    const parsed = parseChamberMarker('CHAMBER_PLAN_PROPOSAL:{"title":"t","planFilePath":"local://t-plan.md"}');
    expect(parsed?.marker).toBe('CHAMBER_PLAN_PROPOSAL:');
    expect(parsed?.payload.title).toBe('t');
  });
});

describe('goal payload readers', () => {
  test('reads a well-formed record', () => {
    const record = { id: 'g1', objective: 'x', status: 'active', tokensUsed: 1, timeUsedSeconds: 1, createdAt: 0, updatedAt: 0 };
    expect(goalRecordFromMarker({ goal: record })?.id).toBe('g1');
    expect(goalEnabledFromMarker({ enabled: true })).toBe(true);
  });

  test('rejects a partial record rather than fabricating one', () => {
    expect(goalRecordFromMarker({ goal: { id: 'g1' } })).toBeNull();
    expect(goalRecordFromMarker({ goal: null })).toBeNull();
    expect(goalRecordFromMarker({})).toBeNull();
  });

  test('enabled is strict', () => {
    expect(goalEnabledFromMarker({ enabled: 'yes' })).toBe(false);
    expect(goalEnabledFromMarker({})).toBe(false);
  });
});
