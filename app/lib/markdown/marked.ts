/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configured marked-based markdown → HTML pipeline.
 *
 * Stack (run in order, all server/client safe — parsed synchronously):
 *   1. remend  — heal incomplete markdown while streaming (before parse)
 *   2. marked  — GFM true, breaks false, autolink via marked-linkify-it (CJK
 *      punctuation is not swallowed into URLs), plus a KaTeX extension for
 *      \(...\) inline, \[...\] block, and $$...$$ display math
 *
 * The resulting HTML is NOT sanitized here — run the output through
 * DOMPurify (see sanitize.ts) before injecting, so raw HTML from the
 * assistant is escaped rather than executed.
 */

import { Marked } from 'marked';
import markedLinkifyIt from 'marked-linkify-it';
import katex from 'katex';
import remend from 'remend';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import 'prismjs/themes/prism.css';

/** Escape HTML for safe interpolation inside Prism-highlighted output. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Highlight code with Prism when a language is known, else escape it. */
function highlight(code: string, lang: string): string {
  if (!code) return '';
  const language = Prism.languages[lang] ? lang : 'javascript';
  try {
    return Prism.highlight(code, Prism.languages[language], language);
  } catch {
    return escapeHtml(code);
  }
}

/** Render KaTeX to HTML. Errors are non-fatal: invalid math renders as red
 *  source (throwOnError:false), so a stale LaTeX half during streaming never
 *  breaks the whole message. */
function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode });
  } catch {
    return displayMode ? `<p>${tex}</p>` : tex;
  }
}

interface TokenLike {
  type: string;
  text?: string;
  raw?: string;
}

const marked = new Marked({
  gfm: true,
  breaks: false,
});

marked.use(markedLinkifyIt());

interface CodeToken {
  type: string;
  text?: string;
  lang?: string;
  raw?: string;
}

// Wrap fenced code blocks with a floating copy button (top-right, inside the
// block). The delegated click listener in MarkdownRenderer handles the copy
// via the data-copy attribute — no React handler needed.
function codeBlockRenderer(token: CodeToken): string {
  const lang = token.lang?.trim() || 'text';
  const code = token.text ?? '';
  const copyAttr = code.replace(/"/g, '&quot;');
  const highlighted = lang === 'text' ? escapeHtml(code) : highlight(code, lang);
  return `<div class="code-block">
  <button type="button" class="code-copy-float" data-copy="${copyAttr}" aria-label="Copy code">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  </button>
  <pre><code class="language-${lang}">${highlighted}</code></pre>
</div>\n`;
}

marked.use({
  renderer: {
    code(this: unknown, token: CodeToken) {
      // Fenced/block code (``` ... ``` or indented) gets the wrapper; inline
      // backtick code is single-line and stays plain. Distinguish by the raw
      // marker: fenced begins with backticks, inline has no newline.
      const isFenced = Boolean(token.raw && /^```/.test(token.raw));
      if (isFenced || (token.text ?? '').includes('\n')) {
        return codeBlockRenderer(token);
      }
      return `<code class="inline-code">${escapeHtml(token.text ?? '')}</code>`;
    },
    // Inline backtick code uses the `codespan` token (not `code`) in marked
    // v18 — render it with the same styled inline-code class.
    codespan(this: unknown, token: CodeToken) {
      return `<code class="inline-code">${escapeHtml(token.text ?? '')}</code>`;
    },
  },
});

marked.use({
  extensions: [
    // \( ... \) inline math
    {
      name: 'inlineMath',
      level: 'inline',
      start(src: string) {
        return src.match(/\\\(/)?.index;
      },
      tokenizer(src: string) {
        const match = /^\\\(([\s\S]+?)\\\)/.exec(src);
        return match
          ? { type: 'inlineMath', raw: match[0], text: match[1] }
          : undefined;
      },
      renderer(token: TokenLike) {
        return renderKatex(token.text ?? '', false);
      },
    },
    // \[ ... \] block math
    {
      name: 'blockMath',
      level: 'block',
      start(src: string) {
        return src.match(/^\\\[/)?.index;
      },
      tokenizer(src: string) {
        const match = /^\\\[([\s\S]+?)\\\]/.exec(src);
        return match
          ? { type: 'blockMath', raw: match[0], text: match[1] }
          : undefined;
      },
      renderer(token: TokenLike) {
        return renderKatex(token.text ?? '', true);
      },
    },
    // $$ ... $$ display math (block-level, must be its own line)
    {
      name: 'blockMathDisplay',
      level: 'block',
      start(src: string) {
        return src.match(/^\$\$/)?.index;
      },
      tokenizer(src: string) {
        const match = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);
        return match
          ? { type: 'blockMathDisplay', raw: match[0], text: match[1] }
          : undefined;
      },
      renderer(token: TokenLike) {
        return renderKatex(token.text ?? '', true);
      },
    },
  ],
});

/** Escape HTML special chars in text, leaving backtick-delimited code intact
 *  (inline `code` and fenced ``` blocks) so code like `a < b` is not mangled
 *  by double-escaping. */
function escapeHtmlOutsideCode(source: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return source
    .split('`')
    .map((part, i) => (i % 2 === 1 ? part : escape(part)))
    .join('`');
}

/**
 * Heal streaming markdown (remend) then parse to HTML via marked.
 * Synchronous and side-effect free — safe in both server loaders and the
 * browser. The output must be sanitized with DOMPurify before injection.
 *
 * Raw HTML in the source is escaped (instruksi: assistant HTML is escaped,
 * never rendered) — `<script>`/`<img onerror>` come through as literal text
 * while backtick code is preserved. DOMPurify remains the second line of
 * defence.
 */
export function renderMarkdown(markdown: string): string {
  const escaped = escapeHtmlOutsideCode(markdown);
  const healed = remend(escaped, { katex: true, inlineKatex: true });
  return marked.parse(healed) as string;
}

export { marked };
