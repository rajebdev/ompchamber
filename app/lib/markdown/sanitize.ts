/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DOMPurify sanitizer for rendered markdown HTML.
 *
 * The assistant is allowed to produce HTML but we never execute it: raw HTML
 * tags are stripped by default (DOMPurify default profile) while KaTeX's
 * MathML nodes are preserved via ADD_TAGS/ADD_ATTR. Sanitization is
 * client-only — in a non-DOM (SSR) environment we return the input unchanged
 * and let the browser dev server apply it on the client.
 */

import DOMPurify from 'dompurify';

const KATEX_MATHML_TAGS = [
  'math',
  'annotation',
  'annotation-xml',
  'semantics',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mspace',
  'ms',
  'mtext',
  'mroot',
  'mfrac',
  'msqrt',
  'mstyle',
  'merror',
  'mpadded',
  'mphantom',
  'mtable',
  'mtr',
  'mtd',
  'mlabeledtr',
  'munder',
  'mover',
  'munderover',
  'msup',
  'msub',
  'msubsup',
  'mtext',
  'mtd',
  'menclose',
];

/** Whether KaTeX output is present — extends the allowlist for MathML. */
function hasKatex(html: string): boolean {
  return /class="[^"]*katex/.test(html);
}

/** Inline SVG icons emitted by the marked code-block copy button. */
const COPY_ICON_TAGS = ['svg', 'path', 'polyline', 'rect', 'circle', 'line'];
const COPY_ICON_ATTRS = [
  'viewBox', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'xmlns', 'aria-hidden', 'aria-label',
];

/**
 * Sanitize a rendered markdown HTML string. Strips scripts/event handlers and
 * unknown tags (default profile) so assistant HTML is escaped, not executed.
 * KaTeX MathML + the code-copy icon SVG are preserved when present.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return html;
  if (typeof window === 'undefined' || !window.document) return html;

  const hasSvgIcon = /<svg[^>]*>/.test(html);
  const config = hasKatex(html) || hasSvgIcon
    ? {
        USE_PROFILES: { html: true, mathMl: true } as const,
        ADD_TAGS: [...KATEX_MATHML_TAGS, ...(hasSvgIcon ? COPY_ICON_TAGS : [])],
        ADD_ATTR: ['aria-hidden', 'aria-label', 'encoding', 'nonce', ...(hasSvgIcon ? COPY_ICON_ATTRS : [])],
      }
    : { USE_PROFILES: { html: true } as const };

  try {
    return DOMPurify.sanitize(html, config);
  } catch {
    return html;
  }
}
