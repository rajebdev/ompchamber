/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import {
  codeWindow,
  clampWindow,
  firstWindow,
  measuredGeometry,
  resolveWindow,
  shouldWindow,
  uniformGeometry,
  windowSpace,
  WHOLE_DOCUMENT_MAX_CHARS,
  WHOLE_DOCUMENT_MAX_LINES,
  WINDOW_OVERSCAN,
  type LineGeometry,
} from '@/shared/lib/code/lazy-window';

const ROW = 18;

/** `measuredGeometry` returns null for heights that do not fit the document. */
function measured(heights: number[]): LineGeometry {
  const geometry = measuredGeometry(heights, ROW, heights.length);
  if (!geometry) throw new Error('heights should describe every line');
  return geometry;
}

describe('shouldWindow', () => {
  test('leaves a short document on the plain surface', () => {
    expect(shouldWindow(120, 4_000)).toBe(false);
  });

  test('windows a document that is long in lines or in characters', () => {
    expect(shouldWindow(WHOLE_DOCUMENT_MAX_LINES + 1, 10)).toBe(true);
    expect(shouldWindow(10, WHOLE_DOCUMENT_MAX_CHARS + 1)).toBe(true);
  });
});

describe('uniformGeometry', () => {
  const geometry = uniformGeometry(ROW, 500);

  test('spaces lines one row apart and totals the document', () => {
    expect(geometry.offsetOf(0)).toBe(0);
    expect(geometry.offsetOf(10)).toBe(10 * ROW);
    expect(geometry.totalHeight).toBe(500 * ROW);
  });

  test('maps an offset back to the line covering it', () => {
    expect(geometry.lineAt(0)).toBe(0);
    expect(geometry.lineAt(ROW - 1)).toBe(0);
    expect(geometry.lineAt(ROW)).toBe(1);
    expect(geometry.lineAt(499 * ROW + 3)).toBe(499);
  });

  test('clamps an offset outside the document', () => {
    expect(geometry.lineAt(-50)).toBe(0);
    expect(geometry.lineAt(999_999)).toBe(499);
    expect(geometry.offsetOf(500)).toBe(geometry.totalHeight);
    expect(geometry.offsetOf(999)).toBe(geometry.totalHeight);
  });
});

describe('measuredGeometry', () => {
  // Every third line wraps over three rows; the rest are single rows.
  const heights = Array.from({ length: 9 }, (_, index) => (index % 3 === 2 ? ROW * 3 : ROW));
  const geometry = measured(heights);

  test('builds offsets from the wrapped heights', () => {
    expect(geometry.offsetOf(0)).toBe(0);
    expect(geometry.offsetOf(1)).toBe(ROW);
    expect(geometry.offsetOf(2)).toBe(2 * ROW);
    // Line 2 spans three rows, so line 3 starts after all three.
    expect(geometry.offsetOf(3)).toBe(5 * ROW);
    expect(geometry.totalHeight).toBe(heights.reduce((sum, height) => sum + height, 0));
  });

  test('maps an offset inside a wrapped line to that line', () => {
    expect(geometry.lineAt(2 * ROW)).toBe(2);
    expect(geometry.lineAt(4 * ROW + 5)).toBe(2);
    expect(geometry.lineAt(5 * ROW)).toBe(3);
  });

  test('refuses heights that do not describe every line', () => {
    expect(measuredGeometry([ROW, ROW], ROW, 5)).toBeNull();
    expect(measuredGeometry([], ROW, 0)).toBeNull();
  });
});

describe('resolveWindow', () => {
  const geometry = uniformGeometry(ROW, 1_000);

  test('covers the viewport plus overscan on both sides', () => {
    // Viewport rows 100..128 (the last row is half covered, so it is included).
    const window = resolveWindow(geometry, 100 * ROW, 28 * ROW);
    expect(window).toEqual({ start: 100 - WINDOW_OVERSCAN, end: 129 + WINDOW_OVERSCAN });
  });

  test('never runs past either end of the document', () => {
    expect(resolveWindow(geometry, 0, ROW)).toEqual({ start: 0, end: 2 + WINDOW_OVERSCAN });
    expect(resolveWindow(geometry, 999 * ROW, 40 * ROW).end).toBe(1_000);
  });

  test('keeps a zero-height band to at least the line under it', () => {
    const window = resolveWindow(geometry, 400 * ROW, 0);
    expect(window.start).toBeLessThanOrEqual(400);
    expect(window.end).toBeGreaterThan(400);
  });
});

describe('firstWindow', () => {
  test('bounds the opening render of a long document', () => {
    expect(firstWindow(20_000).start).toBe(0);
    expect(firstWindow(20_000).end).toBeLessThan(20_000);
  });

  test('keeps a short document whole', () => {
    expect(firstWindow(3)).toEqual({ start: 0, end: 3 });
  });
});

describe('clampWindow', () => {
  test('pulls a window left over from another document back inside it', () => {
    expect(clampWindow({ start: 9_000, end: 9_500 }, 40)).toEqual({ start: 39, end: 40 });
    expect(clampWindow({ start: -5, end: 10 }, 40)).toEqual({ start: 0, end: 10 });
  });

  test('never returns an empty range', () => {
    expect(clampWindow({ start: 5, end: 5 }, 40).end).toBeGreaterThan(5);
  });
});

describe('windowSpace', () => {
  test('reserves exactly the height of the lines outside the window', () => {
    const geometry = uniformGeometry(ROW, 100);
    const space = windowSpace(geometry, { start: 10, end: 30 });
    expect(space).toEqual({ top: 10 * ROW, bottom: 70 * ROW, breakAtEnd: false });
    expect(space.top + space.bottom + (30 - 10) * ROW).toBe(geometry.totalHeight);
  });

  test('flags a window that reaches the last line', () => {
    const geometry = uniformGeometry(ROW, 100);
    expect(windowSpace(geometry, { start: 90, end: 100 }).breakAtEnd).toBe(true);
  });
});

describe('codeWindow', () => {
  test('clamps the range and spaces it in one step', () => {
    const geometry = uniformGeometry(ROW, 50);
    expect(codeWindow(geometry, { start: 0, end: 5_000 })).toEqual({
      start: 0,
      end: 50,
      top: 0,
      bottom: 0,
      breakAtEnd: true,
    });
  });
});
