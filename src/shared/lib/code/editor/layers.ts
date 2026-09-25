/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The inline styles that keep the editor's two layers in register.
 *
 * The transparent `<textarea>` (which owns the caret, the selection and every
 * keystroke) sits exactly on top of the `<pre>` (which paints the glyphs), so
 * both must lay text out identically: `layerStyles` is the shared half —
 * every typographic property inherits rather than being restated, because a
 * second copy of the font stack is what makes the two drift.
 *
 * The `<pre>` additionally carries the space of the lines the window is not
 * rendering, as padding, which is the whole trick behind the lazy surface: the
 * textarea still holds every line, so the caret lands where the reader expects
 * without the highlighter ever tokenizing the rest of the document.
 */

import type { CSSProperties } from 'preact';
import type { CodeWindow } from '@/shared/lib/code/lazy-window';

/** The shared typography, inherited from the caller's own class. */
export function layerStyle(): CSSProperties {
  return {
    margin: 0,
    border: 0,
    background: 'none',
    boxSizing: 'inherit',
    display: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontStyle: 'inherit',
    fontVariantLigatures: 'inherit',
    fontWeight: 'inherit',
    letterSpacing: 'inherit',
    lineHeight: 'inherit',
    tabSize: 'inherit',
    textIndent: 'inherit',
    textRendering: 'inherit',
    textTransform: 'inherit',
    whiteSpace: 'pre-wrap',
    wordBreak: 'keep-all',
    overflowWrap: 'break-word',
  };
}

/** The plain inset both layers take; `padding` is the editor's own padding. */
function contentStyle(padding: number): CSSProperties {
  return { paddingTop: padding, paddingRight: padding, paddingBottom: padding, paddingLeft: padding };
}

/** Both layers' styles for one render: the shared typography plus each one's box. */
export function layerStyles(padding: number, virtual: CodeWindow | null | undefined) {
  const content = contentStyle(padding);
  return {
    /** Textarea: the full document, so its padding is the plain inset. */
    textarea: content,
    /** `<pre>`: the window, with the unrendered lines reserved as padding. */
    pre: {
      ...content,
      paddingTop: padding + (virtual?.top ?? 0),
      paddingBottom: padding + (virtual?.bottom ?? 0),
    },
  };
}
