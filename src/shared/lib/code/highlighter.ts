/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHighlighterCore } from 'shiki/core';
import type { HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import oneLight from '@shikijs/themes/one-light';
import oneDarkPro from '@shikijs/themes/one-dark-pro';

import {
  ensureLanguage,
  ensureLanguages,
  isLanguageReady,
  onLanguageReady as _onLanguageReady,
} from '@/shared/lib/code/highlighter-lazy';
import { EAGER_LANGS } from '@/shared/lib/code/shiki-langs';

let instance: HighlighterCore | null = null;
let ready = false;
const listeners = new Set<() => void>();

/** HTML-escape `&`, `<`, `>` so plain fallback output stays injection-safe. */
export function escapeCode(code: string): string {
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

async function boot(): Promise<HighlighterCore | null> {
  if (typeof window === 'undefined') return null;
  try {
    const highlighter = await createHighlighterCore({
      themes: [oneLight, oneDarkPro],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
    instance = highlighter;
    ready = true;
    notify();
    // Grammars arrive on demand (`ensureLanguage`); the eager set is only a
    // head start for the languages a chat session hits immediately, and boot
    // does not wait on it.
    void ensureLanguages(highlighter, EAGER_LANGS);
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

/** The highlighter, or `null` before boot completes. */
export function getHighlighterSync(): HighlighterCore | null {
  return ready ? instance : null;
}

/**
 * Request the grammar for `language`, if the highlighter is booted. Returns
 * whether the grammar is usable synchronously *right now* — callers that get
 * `false` must render the plain-text fallback and re-run once
 * `onLanguageReady`/`onSyntaxReady` fires.
 *
 * This is the only path that pulls a grammar chunk off the network, so it is
 * deliberately pull-based: a language nobody renders is never fetched.
 */
export function requestLanguage(language: string): boolean {
  if (!instance) return false;
  void ensureLanguage(instance, language);
  return isLanguageReady(language);
}

/** Fires whenever a grammar lands, so pending highlights can retry. */
export const onLanguageReady = _onLanguageReady;
