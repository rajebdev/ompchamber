/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end coverage for lazy math rendering.
 *
 * KaTeX is no longer rendered during markdown parsing (it is a ~522 kB async
 * chunk), so the pipeline emits a `.math-pending` placeholder that
 * `hydrateMathBlocks` later swaps for real markup. That split has two failure
 * modes a unit test on either half alone would miss:
 *
 *   1. DOMPurify drops a bare root-level `<span>`, which silently deleted every
 *      block (`$$…$$`) formula and stripped KaTeX's outer `.katex` wrapper.
 *   2. The placeholder attributes (`data-math`, `data-math-display`) must survive
 *      `sanitizeHtml`, or hydration has nothing to read.
 *
 * These run against a real DOM (happy-dom) because both paths are DOM-dependent;
 * they are no-ops everywhere else.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

let hydrateMathBlocks: typeof import('@/shared/lib/markdown/katex').hydrateMathBlocks;
let renderMarkdown: typeof import('@/shared/lib/markdown/marked').renderMarkdown;
let sanitizeHtml: typeof import('@/shared/lib/markdown/sanitize').sanitizeHtml;

beforeAll(async () => {
  const win = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    MutationObserver: win.MutationObserver,
    Node: win.Node,
    Element: win.Element,
    HTMLElement: win.HTMLElement,
    NodeFilter: win.NodeFilter,
  });
  // Dynamic import is required here, not stylistic: `sanitize.ts` binds
  // DOMPurify at module scope, which captures the DOM globals present at
  // evaluation time. A static import would run before the happy-dom globals
  // above exist and bind the sanitizer to a window-less environment.
  ({ hydrateMathBlocks } = await import('@/shared/lib/markdown/katex'));
  ({ renderMarkdown } = await import('@/shared/lib/markdown/marked'));
  ({ sanitizeHtml } = await import('@/shared/lib/markdown/sanitize'));
});

/** Render markdown and mount it exactly as `MarkdownRenderer` does. */
function mount(content: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = sanitizeHtml(renderMarkdown(content));
  document.body.appendChild(host);
  return host;
}

describe('lazy math rendering', () => {
  test('inline math survives sanitization and hydrates to KaTeX', async () => {
    const host = mount('rumus $E = mc^2$ disini');

    const placeholder = host.querySelector('.math-pending');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute('data-math')).toBe('E = mc^2');

    expect(await hydrateMathBlocks(host)).toEqual({ rendered: 1, failed: 0 });

    expect(host.querySelectorAll('.math-pending').length).toBe(0);
    // The outer wrapper is what every katex.css layout rule targets.
    expect(host.querySelector('.katex')).not.toBeNull();
    expect(host.querySelectorAll('.katex math').length).toBeGreaterThan(0);
  });

  test('block math renders in display mode', async () => {
    const host = mount('$$\\int_0^1 x^2 dx$$');

    const placeholder = host.querySelector('.math-pending');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.getAttribute('data-math-display')).toBe('1');

    await hydrateMathBlocks(host);
    expect(host.querySelector('.katex-display')).not.toBeNull();
  });

  test('multiple formulas each hydrate', async () => {
    // `$$…$$` only parses as display math on its own line (see the flanking
    // rules in marked.ts), so the block case is a separate line here.
    const host = mount('$a$ dan $b$\n\n$$c$$');
    expect(host.querySelectorAll('.math-pending').length).toBe(3);

    expect((await hydrateMathBlocks(host)).rendered).toBe(3);
    expect(host.querySelectorAll('.katex').length).toBe(3);
  });

  test('no placeholders is a no-op', async () => {
    const host = mount('plain text, no math');
    expect(await hydrateMathBlocks(host)).toEqual({ rendered: 0, failed: 0 });
  });

  test('invalid LaTeX degrades without throwing', async () => {
    const host = mount('bad $\\frac{1}{$ here');
    await expect(hydrateMathBlocks(host)).resolves.toBeDefined();
  });

  test('escapes the tex source so it cannot break out of the attribute', () => {
    const html = renderMarkdown('a $x" onmouseover="alert(1)$ b');
    expect(html).not.toContain('onmouseover="alert');
  });
});
