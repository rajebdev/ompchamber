/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import {
  HANDLE_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
  mergePanelWidths,
  normalizePanelWidths,
  resolvePanelWidth,
} from '@/shared/lib/workspace/panel-widths';

describe('normalizePanelWidths', () => {
  test('keeps every panel slot from a current blob', () => {
    const raw = {
      left: 342,
      editor: { px: 620, fraction: 0.54 },
      diff: { fraction: 0.6 },
      right: { files: { px: 300, fraction: 0.26 }, browser: { px: 804 } },
    };

    expect(normalizePanelWidths(raw, 'files')).toEqual(raw);
  });

  test('reads a bare number as the px-only shape and keeps it for conversion', () => {
    // Blobs written before fractions existed: the pixel width must survive so
    // the layout can convert it once the group's area is known.
    const widths = normalizePanelWidths({ left: 342, editor: 620, right: { files: 300 } }, 'files');

    expect(widths).toEqual({ left: 342, editor: { px: 620 }, right: { files: { px: 300 } } });
  });

  test('adopts a legacy shared right width into the view that was open', () => {
    const widths = normalizePanelWidths({ left: 342, editor: 620, right: 1091 }, 'browser');

    expect(widths.right).toEqual({ browser: { px: 1091 } });
    expect(widths.left).toBe(342);
    expect(widths.editor).toEqual({ px: 620 });
  });

  test('drops an out-of-range fraction instead of trusting it', () => {
    // A fraction is a share of the area, so 0 and >1 are meaningless; the px
    // fallback in the same slot survives, and a slot left with neither unit
    // disappears rather than being kept as an empty object.
    const widths = normalizePanelWidths(
      { editor: { px: 620, fraction: 1.25 }, diff: { fraction: 0 }, right: { files: { fraction: -0.5 } } },
      'files',
    );

    expect(widths).toEqual({ editor: { px: 620 } });
  });

  test('drops unusable entries instead of trusting the blob', () => {
    // `chat` is an obsolete slot — the chat column is the filler now — and a
    // blob written before that must not resurrect it.
    const widths = normalizePanelWidths(
      { left: -10, chat: 700, editor: { px: 620.4 }, diff: null, right: { files: { px: 0 }, bogus: 300, git: { px: 260 } } },
      'files',
    );

    expect(widths).toEqual({ editor: { px: 620 }, right: { git: { px: 260 } } });
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
      editor: { px: 620, fraction: 0.54 },
      diff: { fraction: 0.6 },
      right: { files: { px: 300, fraction: 0.26 }, git: { px: 260 } },
    };

    const merged = mergePanelWidths(stored, { right: { browser: { px: 804, fraction: 0.7 } } });

    expect(merged.right).toEqual({
      files: { px: 300, fraction: 0.26 },
      git: { px: 260 },
      browser: { px: 804, fraction: 0.7 },
    });
    expect(merged.left).toBe(342);
    expect(merged.editor).toEqual({ px: 620, fraction: 0.54 });
    expect(merged.diff).toEqual({ fraction: 0.6 });
  });

  test('a patch adds a unit without discarding the one already stored', () => {
    // A drag reports px + fraction together, but the conversion pass reports a
    // fraction alone; it must not erase the px fallback it was derived from.
    const merged = mergePanelWidths({ editor: { px: 620 } }, { editor: { fraction: 0.54 } });

    expect(merged.editor).toEqual({ px: 620, fraction: 0.54 });
  });

  test('a resized panel replaces only its own slot', () => {
    const merged = mergePanelWidths(
      { left: 300, editor: { px: 620 }, diff: { px: 900 }, right: { files: { px: 300 } } },
      { editor: { px: 480, fraction: 0.4 } },
    );

    expect(merged).toEqual({
      left: 300,
      editor: { px: 480, fraction: 0.4 },
      diff: { px: 900 },
      right: { files: { px: 300 } },
    });
  });
});

describe('resolvePanelWidth', () => {
  const base = {
    defaultFraction: 0.6,
    defaultPx: 600,
    min: 320,
    siblingMin: 0,
    handleCount: 0,
  };

  test('opens at its default share of the measured area', () => {
    expect(resolvePanelWidth({ ...base, available: 1000 })).toBe(600);
  });

  test('falls back to the pixel width before the area is known', () => {
    // Not zero: a panel whose area has not been measured yet must still render
    // at the width it is supposed to open at.
    expect(resolvePanelWidth({ ...base, available: null })).toBe(600);
    expect(resolvePanelWidth({ ...base, available: null, stored: { px: 512 } })).toBe(512);
  });

  test('a px-only value holds its pixel width; only a fraction follows the area', () => {
    // The conversion is an identity (`px / available * available`), which is
    // the point: a pixel value someone chose is honoured as written rather than
    // being rescaled behind their back. It stops following the window only
    // until that slot is dragged once, which stores a fraction alongside it.
    expect(resolvePanelWidth({ ...base, available: 1000, stored: { px: 480 } })).toBe(480);
    expect(resolvePanelWidth({ ...base, available: 2000, stored: { px: 480 } })).toBe(480);
    // With both units stored, the fraction is what the panel follows.
    expect(resolvePanelWidth({ ...base, available: 2000, stored: { px: 480, fraction: 0.24 } })).toBe(480);
    expect(resolvePanelWidth({ ...base, available: 2000, stored: { px: 480, fraction: 0.3 } })).toBe(600);
  });

  test('a stored fraction beats the default share', () => {
    // 0.45 of 1000 is 450: above the 320 floor and below the 0.6 default, so
    // the result can only come from the stored fraction.
    expect(resolvePanelWidth({ ...base, available: 1000, stored: { px: 480, fraction: 0.45 } })).toBe(450);
  });

  test('the ceiling leaves the chat its floor, the siblings theirs, and the handles their width', () => {
    const available = 2000;
    const expected = available - MIN_CHAT_PANEL_WIDTH - 320 - 2 * HANDLE_WIDTH;

    expect(resolvePanelWidth({ ...base, available, siblingMin: 320, handleCount: 2, stored: { fraction: 0.9 } })).toBe(expected);
  });

  test('the floor wins over a ceiling squeezed below it', () => {
    // A window too narrow for the chat floor, a sibling and this panel: the
    // panel keeps its minimum and the row clips, rather than collapsing.
    expect(resolvePanelWidth({ ...base, available: 400, siblingMin: 320, handleCount: 2 })).toBe(320);
  });
});
