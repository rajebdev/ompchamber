/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Async client-side hydration for ```mermaid blocks emitted by marked.ts.
 *
 * marked renders mermaid fences as `.mermaid-block[data-mermaid=<uri-encoded
 * source>]` placeholders; this module lazily imports mermaid (kept out of the
 * main bundle), renders each source to SVG, sanitizes it, and swaps the
 * placeholder in place. Parse errors fall back to the raw source so streaming
 * half-diagrams degrade to code instead of breaking the timeline.
 *
 * Rendered SVGs are cached per theme+source so a remounted block (timeline
 * scroll, re-render) is restored synchronously instead of flashing the
 * placeholder again.
 */

import { sanitizeMermaidSvg } from '@/shared/lib/markdown/sanitize';

export interface MermaidRenderResult {
  rendered: number;
  failed: number;
}

type MermaidModule = typeof import('mermaid');
type ThemeKey = 'dark' | 'default';

const SVG_CACHE_LIMIT = 60;
const svgCache = new Map<string, string>();

let mermaidPromise: Promise<MermaidModule['default']> | null = null;
let lastThemeKey: ThemeKey | null = null;

function resolveThemeKey(): ThemeKey {
  const theme = document.documentElement.dataset.theme || document.documentElement.getAttribute('data-theme');
  return theme === 'one-dark-pro-soft' || theme === 'noir' || theme === 'dark' ? 'dark' : 'default';
}

function cacheKey(themeKey: ThemeKey, source: string): string {
  return `${themeKey}\u0000${source}`;
}

function readCachedSvg(themeKey: ThemeKey, source: string): string | null {
  return svgCache.get(cacheKey(themeKey, source)) ?? null;
}

function writeCachedSvg(themeKey: ThemeKey, source: string, svg: string): void {
  if (svgCache.size >= SVG_CACHE_LIMIT) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
  svgCache.set(cacheKey(themeKey, source), svg);
}

async function loadMermaid(themeKey: ThemeKey): Promise<MermaidModule['default']> {
  if (!mermaidPromise || lastThemeKey !== themeKey) {
    lastThemeKey = themeKey;
    mermaidPromise = import('mermaid')
      .then((mod) => {
        mod.default.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: themeKey,
          flowchart: { useMaxWidth: false, wrappingWidth: 100000 },
          sequence: { useMaxWidth: false },
        });
        return mod.default;
      })
      .catch((error) => {
        mermaidPromise = null;
        throw error;
      });
  }
  return mermaidPromise;
}

function applySvg(block: HTMLElement, svg: string, themeKey: ThemeKey): void {
  const source = block.dataset.mermaid ?? '';
  const copyAttr = source.replace(/"/g, '&quot;');
  block.innerHTML =
    `<button type="button" class="code-copy-float" data-copy="${copyAttr}" aria-label="Copy diagram source">` +
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
    '</button>' +
    svg;
  block.dataset.mermaidState = 'done';
  block.dataset.mermaidTheme = themeKey;

  // Mermaid sizes the SVG from its own 16px label metrics. Cap the rendered
  // width so the effective label size lands near the app's body text instead
  // of towering over it; narrow columns still shrink the whole diagram.
  const diagram = block.querySelector<SVGSVGElement>(':scope > svg');
  const naturalWidth = Number(diagram?.getAttribute('width'));
  if (diagram && Number.isFinite(naturalWidth) && naturalWidth > 0) {
    block.style.setProperty('--mermaid-diagram-max', `${Math.round(naturalWidth * 0.8)}px`);
  }
}

let renderSeq = 0;

async function renderBlock(block: HTMLElement, cachedOnly: boolean): Promise<boolean> {
  const source = block.dataset.mermaid;
  if (source == null) return false;

  const themeKey = resolveThemeKey();
  const decoded = decodeURIComponent(source);
  const cached = readCachedSvg(themeKey, decoded);
  if (cached) {
    applySvg(block, cached, themeKey);
    return true;
  }
  if (cachedOnly) return true;

  block.dataset.mermaidState = 'rendering';
  try {
    const mermaid = await loadMermaid(themeKey);
    const { svg } = await mermaid.render(`mermaid-svg-${Date.now()}-${renderSeq++}`, decoded);
    if (!block.isConnected) return false;
    const clean = sanitizeMermaidSvg(svg);
    writeCachedSvg(themeKey, decoded, clean);
    applySvg(block, clean, themeKey);
    return true;
  } catch {
    if (block.isConnected) block.dataset.mermaidState = 'error';
    return false;
  }
}

/**
 * Render every pending `.mermaid-block` under `root`. Theme changes re-run
 * this via `force: true`. Idempotent — blocks already rendered with the
 * current theme are skipped unless forced. With `cachedOnly`, only blocks
 * whose SVG is already cached are restored (synchronous, no rendering) — the
 * fast path that keeps remounted blocks from flashing the placeholder.
 */
export async function hydrateMermaidBlocks(
  root: ParentNode,
  options: { force?: boolean; cachedOnly?: boolean } = {},
): Promise<MermaidRenderResult> {
  const themeKey = resolveThemeKey();
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'));
  const results = await Promise.all(
    blocks.map(async (block) => {
      const state = block.dataset.mermaidState;
      const themed = block.dataset.mermaidTheme === themeKey;
      if (state === 'done' && themed && !options.force) return true;
      if (state === 'rendering') return false;
      return renderBlock(block, options.cachedOnly === true);
    }),
  );
  return { rendered: results.filter(Boolean).length, failed: results.filter((ok) => !ok).length };
}
