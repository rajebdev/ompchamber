/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The two-layer alignment contract.
 *
 * The transparent `<textarea>` sits exactly on top of the highlighted `<pre>`,
 * so any typographic property that differs between them puts the caret on a
 * different row than the glyphs. These assertions pin the two things that
 * matter: both layers inherit their typography (a second copy of the font stack
 * is what makes them drift), and the `<pre>` reserves the unrendered lines as
 * padding while the textarea keeps the plain inset.
 */

import { describe, expect, test } from 'bun:test';

import { layerStyle, layerStyles } from '@/shared/lib/code/editor/layers';

describe('layerStyle', () => {
  test('inherits every typographic property rather than restating it', () => {
    const style = layerStyle();

    for (const property of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'tabSize'] as const) {
      expect(style[property]).toBe('inherit');
    }
  });

  test('breaks words the same way the gutter measured them', () => {
    // The measurement mirror copies these from the editor's computed style; a
    // layer that broke differently would put the numbers on the wrong rows.
    const style = layerStyle();

    expect(style.whiteSpace).toBe('pre-wrap');
    expect(style.overflowWrap).toBe('break-word');
    expect(style.wordBreak).toBe('keep-all');
  });

  test('takes its box from the caller, not from the UA', () => {
    const style = layerStyle();

    expect(style.boxSizing).toBe('inherit');
    expect(style.display).toBe('inherit');
    expect(style.margin).toBe(0);
    expect(style.border).toBe(0);
  });
});

describe('layerStyles', () => {
  test('both layers carry the caller’s padding', () => {
    const { pre, textarea } = layerStyles(16, null);

    expect(textarea.paddingTop).toBe(16);
    expect(textarea.paddingLeft).toBe(16);
    expect(pre.paddingTop).toBe(16);
    expect(pre.paddingBottom).toBe(16);
  });

  test('the pre reserves the unrendered lines as padding', () => {
    // Windowing is the whole trick: the textarea holds the document, the pre
    // holds a slice of it, and the space of everything else is this padding.
    const { pre, textarea } = layerStyles(8, { start: 100, end: 120, top: 900, bottom: 200, breakAtEnd: false });

    expect(pre.paddingTop).toBe(908);
    expect(pre.paddingBottom).toBe(208);
    expect(textarea.paddingTop).toBe(8);
    expect(textarea.paddingBottom).toBe(8);
  });

  test('a window without space leaves the plain inset', () => {
    const { pre } = layerStyles(4, { start: 0, end: 10, top: 0, bottom: 0, breakAtEnd: true });

    expect(pre.paddingTop).toBe(4);
    expect(pre.paddingBottom).toBe(4);
  });
});
