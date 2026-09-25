/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The ancestor a code surface actually scrolls inside.
 *
 * The lazy editor window and the find widget's "scroll to this match" both need
 * this answer, and they must agree: one resolves which lines to draw from the
 * visible band, the other moves that band. Two copies of the walk would let the
 * widget scroll a container the window never reads.
 *
 * Walks up rather than taking a ref: the surface is mounted under different
 * scrollers (the desktop editor panel, the phone's full-screen editor) and is
 * also mounted inside a page that scrolls itself, which is the `null` case.
 */
export function findScrollContainer(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}
