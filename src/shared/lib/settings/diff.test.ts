import { describe, expect, test } from 'bun:test';

import { diffSettings } from '@/shared/lib/settings/diff';

describe('diffSettings', () => {
  test('an object patch persists only the keys it actually changed', () => {
    const prev = { theme: 'paper', soundAlerts: true, binaryPath: '/bin/omp' };
    const next = { ...prev, theme: 'nord-dark' };
    expect(diffSettings(prev, next, { theme: 'nord-dark' })).toEqual({ theme: 'nord-dark' });
  });

  test('a no-op patch persists nothing', () => {
    const prev = { theme: 'paper', soundAlerts: true };
    expect(diffSettings(prev, { ...prev }, { theme: 'paper' })).toEqual({});
  });

  test('an updater function persists every key whose value it moved', () => {
    const prev = { keybindingSend: 'Enter', keybindingNewLine: 'Shift + Enter' };
    const next = { keybindingSend: 'Ctrl / Cmd + Enter', keybindingNewLine: 'Enter' };
    expect(diffSettings(prev, next, (state) => ({ ...state, ...next }))).toEqual(next);
  });

  test('an unrelated update never republishes the theme it read', () => {
    // The regression this exists for: a tab that booted on `paper` toggling an
    // unrelated switch in a settings modal whose snapshot predates an external
    // theme change must not write `theme` back.
    const prev = { theme: 'paper', chatCompletionSound: true };
    const patch = { chatCompletionSound: false };
    expect(diffSettings(prev, { ...prev, ...patch }, patch)).toEqual({ chatCompletionSound: false });
  });
});
