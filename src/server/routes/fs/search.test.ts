/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The search route's line parser: what a hit's text and its highlight ranges
 * become by the time the panel sees them.
 *
 * Two rules are asserted here because both fail silently on screen — the row
 * paints the wrong word rather than erroring:
 *
 * - ripgrep reports submatches in BYTES, and a line with one multi-byte
 *   character before the match shifts every range after it.
 * - `content` is trimmed before it travels, so the ranges must be shifted onto
 *   the trimmed text rather than left as offsets into the raw line.
 */

import { describe, expect, test } from 'bun:test';

import { parseRgLine } from '@/server/routes/fs/search';

/** One rg match frame, as `rg --json` emits it. */
function frame(lineText: string, submatches: { start: number; end: number }[]) {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: './src/alpha.ts' },
      line_number: 12,
      lines: { text: lineText },
      submatches,
    },
  });
}

describe('parseRgLine', () => {
  test('strips the leading ./ from the path and trims the line', () => {
    const match = parseRgLine(frame('    const alpha = 1;\n', [{ start: 10, end: 15 }]));

    expect(match).toEqual({
      file: 'src/alpha.ts',
      line: '12',
      content: 'const alpha = 1;',
      ranges: [{ start: 6, end: 11 }],
    });
  });

  test('shifts ranges by the indentation the trim removed', () => {
    const match = parseRgLine(frame('\t\talpha beta alpha\n', [{ start: 2, end: 7 }, { start: 13, end: 18 }]));

    expect(match?.ranges).toEqual([{ start: 0, end: 5 }, { start: 11, end: 16 }]);
  });

  test('converts ripgrep byte offsets to character offsets', () => {
    // `é` is two bytes, so a byte range of 3..8 is characters 2..7.
    const raw = 'é alpha\n';
    const match = parseRgLine(frame(raw, [{ start: 3, end: 8 }]));

    expect(match?.content).toBe('é alpha');
    expect(match?.ranges).toEqual([{ start: 2, end: 7 }]);
  });

  test('drops a range the trim left outside the text', () => {
    // A match that was only trailing whitespace has nothing left to paint.
    const match = parseRgLine(frame('alpha   \n', [{ start: 7, end: 8 }]));

    expect(match?.content).toBe('alpha');
    expect(match?.ranges).toEqual([]);
  });

  test('a frame with no submatches still yields the line', () => {
    const match = parseRgLine(JSON.stringify({
      type: 'match',
      data: { path: { text: './a.ts' }, line_number: 1, lines: { text: 'alpha\n' } },
    }));

    expect(match).toEqual({ file: 'a.ts', line: '1', content: 'alpha', ranges: [] });
  });

  test('non-match frames are ignored', () => {
    expect(parseRgLine(JSON.stringify({ type: 'begin', data: { path: { text: './a.ts' } } }))).toBeNull();
    expect(parseRgLine('not json')).toBeNull();
  });
});
