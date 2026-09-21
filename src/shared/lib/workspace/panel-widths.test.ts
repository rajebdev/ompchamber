/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import { mergePanelWidths, normalizePanelWidths } from '@/shared/lib/workspace/panel-widths';

describe('normalizePanelWidths', () => {
  test('keeps every panel slot from a current blob', () => {
    const raw = {
      left: 342,
      editor: 620,
      diff: 900,
      right: { files: 300, browser: 804 },
    };

    expect(normalizePanelWidths(raw, 'files')).toEqual(raw);
  });

  test('adopts a legacy shared right width into the view that was open', () => {
    const widths = normalizePanelWidths({ left: 342, editor: 620, right: 1091 }, 'browser');

    expect(widths.right).toEqual({ browser: 1091 });
    expect(widths.left).toBe(342);
    expect(widths.editor).toBe(620);
  });

  test('drops unusable entries instead of trusting the blob', () => {
    // `chat` is an obsolete slot — the chat column is the filler now — and a
    // blob written before that must not resurrect it.
    const widths = normalizePanelWidths(
      { left: -10, chat: 700, editor: 620.4, diff: null, right: { files: 0, bogus: 300, git: 260 } },
      'files',
    );

    expect(widths).toEqual({ editor: 620, right: { git: 260 } });
  });

  test('tolerates a missing or malformed blob', () => {
    expect(normalizePanelWidths(undefined, 'files')).toEqual({});
    expect(normalizePanelWidths('nonsense', 'files')).toEqual({});
  });
});

describe('mergePanelWidths', () => {
  test('merging one view keeps every other remembered width', () => {
    const stored = {
      left: 342,
      editor: 620,
      diff: 900,
      right: { files: 300, git: 260 },
    };

    const merged = mergePanelWidths(stored, { right: { browser: 804 } });

    expect(merged.right).toEqual({ files: 300, git: 260, browser: 804 });
    expect(merged.left).toBe(342);
    expect(merged.editor).toBe(620);
    expect(merged.diff).toBe(900);
  });

  test('a resized panel replaces only its own slot', () => {
    const merged = mergePanelWidths(
      { left: 300, editor: 620, diff: 900, right: { files: 300 } },
      { editor: 480 },
    );

    expect(merged).toEqual({ left: 300, editor: 480, diff: 900, right: { files: 300 } });
  });
});
