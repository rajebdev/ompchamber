/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import {
  continuesTyping,
  createHistory,
  mergeTyping,
  pushEdit,
  pushRecord,
  stepHistory,
  HISTORY_TIME_GAP,
  type HistoryRecord,
} from '@/shared/lib/code/editor/history';

const NOW = 1_700_000_000_000;

function record(value: string, caret: number, timestamp = NOW): HistoryRecord {
  return { value, selectionStart: caret, selectionEnd: caret, timestamp };
}

describe('pushRecord', () => {
  test('appends and moves the current position', () => {
    const history = createHistory();
    pushRecord(history, record('a', 1));
    pushRecord(history, record('ab', 2));

    expect(history.stack.map((entry) => entry.value)).toEqual(['a', 'ab']);
    expect(history.offset).toBe(1);
  });

  test('drops the redo entries that follow the current position', () => {
    const history = createHistory();
    pushRecord(history, record('a', 1));
    pushRecord(history, record('ab', 2));
    history.offset = 0;

    pushRecord(history, record('ax', 2));

    expect(history.stack.map((entry) => entry.value)).toEqual(['a', 'ax']);
    expect(history.offset).toBe(1);
  });
});

describe('pushEdit', () => {
  test('caps the stack and keeps the position on the newest entry', () => {
    const history = createHistory();
    for (let i = 0; i < 120; i++) pushEdit(history, record(`v${i}`, 0, NOW + i));

    expect(history.stack.length).toBe(100);
    expect(history.stack[history.offset].value).toBe('v119');
  });
});

describe('continuesTyping', () => {
  const previous = record('const value = 1', 15);

  test('merges a keystroke that keeps extending the same word', () => {
    expect(continuesTyping(previous, 'const value = 12', 16, NOW + 100)).toBe(true);
  });

  test('starts a new entry once the burst window has passed', () => {
    expect(continuesTyping(previous, 'const value = 12', 16, NOW + HISTORY_TIME_GAP + 1)).toBe(false);
  });

  test('does not merge a different word or a fresh word', () => {
    expect(continuesTyping(record('const value', 11), 'const other', 11, NOW + 100)).toBe(false);
    expect(continuesTyping(undefined, 'const value = 12', 16, NOW + 100)).toBe(false);
  });
});

describe('mergeTyping', () => {
  test('rewrites the current entry in place', () => {
    const history = createHistory();
    pushRecord(history, record('a', 1));
    mergeTyping(history, 'ab', 2, 2, NOW + 50);

    expect(history.stack).toHaveLength(1);
    expect(history.stack[0].value).toBe('ab');
    expect(history.stack[0].selectionStart).toBe(2);
  });

  test('invalidates the redo entries after the current position', () => {
    const history = createHistory();
    pushRecord(history, record('a', 1));
    pushRecord(history, record('ab', 2));
    history.offset = 0;

    mergeTyping(history, 'ax', 2, 2, NOW + 50);

    expect(history.stack.map((entry) => entry.value)).toEqual(['ax']);
  });
});

describe('stepHistory', () => {
  test('walks back and forward through the stack', () => {
    const history = createHistory();
    pushRecord(history, record('a', 1));
    pushRecord(history, record('ab', 2));

    expect(stepHistory(history, 'undo')?.value).toBe('a');
    expect(history.offset).toBe(0);
    expect(stepHistory(history, 'redo')?.value).toBe('ab');
    expect(history.offset).toBe(1);
  });

  test('stops at both ends without moving', () => {
    const history = createHistory();
    pushRecord(history, record('a', 1));

    expect(stepHistory(history, 'redo')).toBeNull();
    expect(stepHistory(history, 'undo')).toBeNull();
    expect(history.offset).toBe(0);
  });
});
