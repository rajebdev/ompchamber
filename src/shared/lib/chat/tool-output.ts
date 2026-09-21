/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The one rule every tool-output surface follows: **output is rendered as
 * markdown**.
 *
 * Two things happen before the parser sees it:
 *
 * 1. An XML envelope wrapping the whole output is peeled
 *    (`<system-reminder …>…</system-reminder>`, `<result>…</result>`). Those
 *    tags are transport — left in place, markdown escapes them and the user
 *    reads markup instead of the message it carries.
 * 2. Content markdown would reflow gets fenced. A log, a JSON body, an HTML
 *    dump have no blank lines and no markers: parsed as prose they collapse
 *    into a single paragraph and their `#`/`-` lines turn into headings and
 *    bullets. A fence is still markdown, and it is the only shape that keeps
 *    such a blob verbatim.
 */

import { detectOutputFormat, type OutputFormat } from '@/shared/lib/chat/detect-format';
import { unwrapXmlEnvelope, type XmlEnvelope } from '@/shared/lib/chat/xml-envelope';

export interface ToolOutputText {
  /** What the user reads: the XML envelope peeled off, if there was one. */
  content: string;
  /** Format of `content`, deciding how `outputMarkdown` renders it. */
  format: OutputFormat;
  /** Wrapper that was peeled — rendered as the output's header. */
  envelope?: XmlEnvelope;
}

/** Read raw tool output into the text the timeline renders. */
export function readToolOutput(text: string): ToolOutputText {
  const envelope = unwrapXmlEnvelope(text);
  const content = envelope ? [envelope.inner, envelope.rest].filter(Boolean).join('\n\n') : text;
  return {
    content,
    format: detectOutputFormat(content),
    ...(envelope ? { envelope } : {}),
  };
}

/** Markdown for output content — verbatim formats are fenced so the parser
 *  cannot reflow them; markdown itself passes through untouched. */
export function outputMarkdown(content: string, format: OutputFormat): string {
  if (!content || format === 'markdown') return content;
  let longest = 0;
  for (const run of content.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${format === 'text' ? '' : format}\n${content}\n${fence}`;
}
