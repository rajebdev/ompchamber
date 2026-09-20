/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHighlighterCore } from 'shiki/core';
import type { HighlighterCore, LanguageRegistration } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import oneLight from '@shikijs/themes/one-light';
import oneDarkPro from '@shikijs/themes/one-dark-pro';

import { EAGER_LANGS, LANG_LOADERS } from '@/shared/lib/code/shiki-langs';
import { SHIKI_LIGHT } from '@/shared/lib/code/shiki-themes';

/** Shape of a `@shikijs/langs/*` module (the registration array sits on `.default`). */
type LangModule = { default: LanguageRegistration[] };

/**
 * The transpile cost of the first highlight for a grammar is ~700 ms, so warming
 * all 58 would stall readiness. Cap the warmup: if the eager set is not done in
 * this budget the rest load lazily on first use instead of blocking boot.
 */
const WARMUP_BUDGET_MS = 1500;

let instance: HighlighterCore | null = null;
let ready = false;
const listeners = new Set<() => void>();

/** HTML-escape `&`, `<`, `>` so plain fallback output stays injection-safe. */
export function escapeCode(code: string): string {
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(): void {
  const pending = [...listeners];
  listeners.clear();
  for (const fn of pending) {
    try {
      fn();
    } catch {
      // A listener must never break the others.
    }
  }
}

/**
 * Register every grammar so `getLoadedLanguages()` covers the full registry
 * from the first paint-after-ready. Registration is a parallel chunk fetch
 * (fast); the expensive per-grammar transpile stays in `warmup` below.
 */
async function loadAllLanguages(highlighter: HighlighterCore): Promise<void> {
  await Promise.allSettled(
    Object.keys(LANG_LOADERS).map(async (id) => {
      const loader = LANG_LOADERS[id];
      if (!loader) return;
      try {
        await highlighter.loadLanguage(loader as () => Promise<LangModule>);
      } catch {
        // Grammar unavailable under the JS engine — per-call fallback covers it.
      }
    }),
  );
}

/** Pre-transpile the eager grammars; each failure is independent and ignored. */
async function warmup(highlighter: HighlighterCore): Promise<void> {
  await Promise.all(
    EAGER_LANGS.map(async (id) => {
      try {
        highlighter.codeToHtml('x', { lang: id, theme: SHIKI_LIGHT });
      } catch {
        // Grammar unavailable under the JS engine — falls back to plain text.
      }
    }),
  );
}

async function boot(): Promise<HighlighterCore | null> {
  if (typeof window === 'undefined') return null;
  try {
    const highlighter = await createHighlighterCore({
      themes: [oneLight, oneDarkPro],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
    instance = highlighter;
    await loadAllLanguages(highlighter);
    await Promise.race([warmup(highlighter), delay(WARMUP_BUDGET_MS)]);
    ready = true;
    notify();
    return highlighter;
  } catch (error) {
    console.error('[shiki] highlighter boot failed', error);
    return null;
  }
}

/**
 * Memoized once per page load — never call `createHighlighterCore` in a hot path.
 * Boot is lazy (starts on the first `bootSyntax()` call, not at import time) so
 * the module stays side-effect free: safe to import in SSR/test runtimes where
 * `boot()` immediately resolves `null`, and tests can stub `window` before booting.
 */
let readyPromise: Promise<HighlighterCore | null> | null = null;

/** Resolves with the shared highlighter, or `null` when boot failed / SSR. */
export function bootSyntax(): Promise<HighlighterCore | null> {
  if (!readyPromise) readyPromise = boot();
  return readyPromise;
}

export function isSyntaxReady(): boolean {
  return ready;
}

/** Subscribe to readiness. Returns an unsubscribe fn; fires immediately if already ready. */
export function onSyntaxReady(fn: () => void): () => void {
  if (ready) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The highlighter, or `null` before warmup completes. */
export function getHighlighterSync(): HighlighterCore | null {
  return ready ? instance : null;
}
