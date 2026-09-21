/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool output sometimes arrives wrapped in a single XML envelope: omp's
 * `<system-reminder …>…</system-reminder>`, an MCP server's `<result>…</result>`.
 * The tag is transport, not content — rendered as markdown it would show as
 * escaped markup instead of the message it carries, so the timeline peels the
 * wrapper before rendering the inner text.
 *
 * Only a wrapper that OPENS the output is peeled (a tag in the middle of prose
 * is content: `<div>` inside an HTML sample, `a < b`), its tags must balance
 * and nest, and what follows the closing tag must be free text — a second
 * element means there is no single wrapper, so nothing is peeled.
 *
 * The scan is hand-rolled: this module is shared with the server (no
 * `DOMParser` there) and parses arbitrary tool output, so it must never throw.
 */

export interface XmlEnvelope {
  /** Element name, e.g. `system-reminder`. */
  tag: string;
  /** Attributes of the wrapper's start tag, e.g. `{ reason: 'rule_violation' }`. */
  attributes: Record<string, string>;
  /** Text between the wrapper's start and end tags, common indent removed. */
  inner: string;
  /** Free text that followed the closing tag, if any. */
  rest?: string;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const ATTR_RE = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

interface Tag {
  kind: 'start' | 'end' | 'self' | 'other';
  name: string;
  /** Raw text between the name and the closing `>`. */
  attrs: string;
  /** Index just past the tag's `>`. */
  end: number;
}

/** Attributes of a start tag: `reason="rule_violation" flag`. */
function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(ATTR_RE)) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

/** Envelope tags that mean "the runtime interrupted with a reminder" — the
 *  card header flags them instead of treating them as an ordinary result. */
export function isReminderTag(tag: string): boolean {
  return tag === 'system-reminder' || tag === 'reminder';
}

/** Index of the tag's closing `>` — an attribute value may contain `>`. */
function tagEnd(text: string, from: number): number {
  let quote = '';
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/** Read the markup starting at `<`. Comments, CDATA and processing
 *  instructions come back as `other` so their contents can never be read as
 *  tags. Returns undefined for anything malformed. */
function readTag(text: string, at: number): Tag | undefined {
  const head = text.slice(at, at + 9);
  if (head.startsWith('<!--')) {
    const close = text.indexOf('-->', at + 4);
    return close === -1 ? undefined : { kind: 'other', name: '', attrs: '', end: close + 3 };
  }
  if (head === '<![CDATA[') {
    const close = text.indexOf(']]>', at + 9);
    return close === -1 ? undefined : { kind: 'other', name: '', attrs: '', end: close + 3 };
  }
  if (text[at + 1] === '!' || text[at + 1] === '?') {
    const close = tagEnd(text, at + 2);
    return close === -1 ? undefined : { kind: 'other', name: '', attrs: '', end: close + 1 };
  }

  const closing = text[at + 1] === '/';
  const nameAt = at + (closing ? 2 : 1);
  const name = NAME_RE.exec(text.slice(nameAt, nameAt + 64))?.[0];
  if (!name) return undefined;
  const close = tagEnd(text, nameAt + name.length);
  if (close === -1) return undefined;
  const attrs = text.slice(nameAt + name.length, close);
  if (closing) return { kind: 'end', name, attrs, end: close + 1 };
  return { kind: text[close - 1] === '/' ? 'self' : 'start', name, attrs, end: close + 1 };
}

/** Drop the indentation every line shares — XML pretty-printing padding that
 *  markdown would otherwise read as an indented code block. */
function stripCommonIndent(text: string): string {
  const lines = text.split('\n');
  // The line breaks hugging the wrapper tags are padding, not content.
  if (lines.length > 1 && !lines[0].trim()) lines.shift();
  while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();

  let indent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim()) indent = Math.min(indent, line.length - line.trimStart().length);
  }
  if (!Number.isFinite(indent)) return '';
  if (indent === 0) return lines.join('\n');
  return lines.map((line) => line.slice(Math.min(indent, line.length - line.trimStart().length))).join('\n');
}

/** Peel the XML wrapper when it opens the output and encloses a whole
 *  element. Returns undefined when the output is not such an envelope. */
export function unwrapXmlEnvelope(text: string): XmlEnvelope | undefined {
  const opening = text.search(/\S/);
  if (opening === -1 || text[opening] !== '<') return undefined;

  const root = readTag(text, opening);
  if (!root || root.kind !== 'start') return undefined;

  const stack = [root.name];
  for (let i = root.end; i < text.length; ) {
    if (text[i] !== '<') {
      i += 1;
      continue;
    }
    const tag = readTag(text, i);
    if (!tag) return undefined;
    if (tag.kind === 'start') {
      stack.push(tag.name);
    } else if (tag.kind === 'end') {
      if (stack.pop() !== tag.name) return undefined;
      if (stack.length === 0) {
        const rest = text.slice(tag.end).trim();
        // A sibling element means there is no single wrapper to peel.
        if (rest.startsWith('<')) return undefined;
        return {
          tag: root.name,
          attributes: parseAttributes(root.attrs),
          inner: stripCommonIndent(text.slice(root.end, i)),
          ...(rest ? { rest } : {}),
        };
      }
    }
    i = tag.end;
  }
  return undefined;
}
