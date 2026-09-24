/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configured marked-based markdown → HTML pipeline.
 *
 * Stack (run in order, all server/client safe — parsed synchronously):
 *   1. remend  — heal incomplete markdown while streaming (before parse)
 *   2. marked  — GFM true, breaks true, autolink via linkify-it (CJK
 *      punctuation is not swallowed into URLs, and a match carrying a backtick
 *      is left to the code-span rule — see autolink.ts), plus a KaTeX
 *      extension for \(...\) inline, \[...\] block, and $$...$$ display math
 *
 * The resulting HTML is NOT sanitized here — run the output through
 * DOMPurify (see sanitize.ts) before injecting, so raw HTML from the
 * assistant is escaped rather than executed.
 */

import { Marked } from 'marked';
import { codeSafeAutolink } from '@/shared/lib/markdown/autolink';
import remend from 'remend';
import { highlightCode } from '@/shared/lib/code/syntax-highlight';
import { MATH_PENDING_CLASS } from '@/shared/lib/markdown/katex';

/** Escape HTML for safe interpolation inside highlighted output. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Emit a math placeholder instead of rendering KaTeX inline.
 *
 * `katex` is ~522 kB of JS worth loading only when a message contains math, so
 * it is not imported here. The placeholder carries the TeX source and the
 * display flag; `katex.ts` swaps it for real markup once the library lands
 * (see `hydrateMathBlocks`). Both attributes are HTML-escaped, and escaping
 * `&` first keeps the entity encoding intact through the attribute round-trip.
 */
function renderMathPlaceholder(tex: string, displayMode: boolean): string {
  const escaped = escapeHtml(tex);
  const display = displayMode ? ' data-math-display="1"' : '';
  const span = `<span class="${MATH_PENDING_CLASS}" data-math="${escaped}"${display}></span>`;
  // Block math must stay inside a block element: DOMPurify drops a bare
  // `<span>` that sits at the top level of the fragment, which silently deleted
  // every `$$…$$` formula. KaTeX's own output is inline-level too, so the old
  // synchronous renderer relied on the same wrapper being present.
  return displayMode ? `<p>${span}</p>` : span;
}

interface TokenLike {
  type: string;
  text?: string;
  raw?: string;
}

const marked = new Marked({
  gfm: true,
  breaks: true,
});

marked.use(codeSafeAutolink());

interface CodeToken {
  type: string;
  text?: string;
  lang?: string;
  raw?: string;
}

// Wrap fenced code blocks with a floating copy button (top-right, inside the
// block). The delegated click listener in MarkdownRenderer handles the copy
// via the data-copy attribute — no React handler needed.
function codeBlockShell(code: string, bodyHtml: string): string {
  const copyAttr = code.replace(/"/g, '&quot;');
  return `<div class="code-block">
  <button type="button" class="code-copy-float" data-copy="${copyAttr}" aria-label="Copy code">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  </button>
  ${bodyHtml}
</div>\n`;
}

// ```mermaid fences become a placeholder hydrated to SVG by mermaid.ts.
function mermaidBlockRenderer(code: string): string {
  const body = `<pre><code class="language-mermaid">${escapeHtml(code)}</code></pre>`;
  const shell = codeBlockShell(code, body);
  return `<div class="mermaid-block" data-mermaid="${encodeURIComponent(code)}" data-mermaid-state="pending">${shell}</div>`;
}

function codeBlockRenderer(token: CodeToken): string {
  const lang = token.lang?.trim() || 'text';
  const code = token.text ?? '';
  if (lang === 'mermaid') {
    return mermaidBlockRenderer(code);
  }
  const highlighted = lang === 'text' ? escapeHtml(code) : highlightCode(code, lang);
  return codeBlockShell(code, `<pre><code class="language-${lang}">${highlighted}</code></pre>`);
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
        return renderMathPlaceholder(token.text ?? '', false);
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
        return renderMathPlaceholder(token.text ?? '', true);
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
        return renderMathPlaceholder(token.text ?? '', true);
      },
    },
    // $ ... $ inline math, per remark-math flanking rules: the opening $ must
    // follow start/whitespace/punctuation (never a word char, so "$5 each" and
    // "a$b" read as text) and must not be followed by $ or whitespace; the
    // closing $ must not be preceded by whitespace and not be followed by $
    // or a digit (so "$n$ =" still works but "cost $5$" does not).
    {
      name: 'inlineMathDollar',
      level: 'inline',
      start(src: string) {
        const match = /(^|[^\w$])\$(?!\$)(?!\s)/.exec(src);
        return match ? match.index + (match[1]?.length ?? 0) : undefined;
      },
      tokenizer(src: string) {
        const match = /^\$(?!\$)(?!\s)((?:\\\$|[^$])*?)(?<!\s)\$(?!\$)(?!\d)/.exec(src);
        return match
          ? { type: 'inlineMathDollar', raw: match[0], text: match[1] }
          : undefined;
      },
      renderer(token: TokenLike) {
        return renderMathPlaceholder(token.text ?? '', false);
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

/** remend heals a streaming-incomplete `[text](url` into
 * `[text](streamdown:incomplete-link)`. Swap it for a dimmed span before
 * parsing so the placeholder URL never leaks into the DOM as an href. */
const INCOMPLETE_LINK_RE = /\[([^\]]*)\]\(streamdown:incomplete-link\)/g;

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
  const healed = remend(escaped, { katex: true, inlineKatex: true })
    .replace(INCOMPLETE_LINK_RE, (_, text: string) => `<span class="md-incomplete-link">${text}</span>`);
  return (marked.parse(healed) as string).trim();
}

export { marked };
