export interface AgentMentionMatch {
  name: string;
  start: number;
  end: number;
}

/** Picker-inserted `@file:` mentions (quoted form when the path has spaces). */
const FILE_MENTION_QUOTED_RE = /(^|[\s([{])@"file:([^"]+)"/g;
const FILE_MENTION_BARE_RE = /(^|[\s([{])@file:(\S+)/g;

/**
 * Rewrite picker-inserted `@file:<path>` / `@"file:<path with spaces>"`
 * into oh-my-pi's native file-mention syntax `@<path>` / `@"<path>"`,
 * which the omp runtime expands into attached file contents. The `file:`
 * namespace means a file token can never collide with a bare `@agent`.
 *
 * NOTE: no trailing-punctuation stripping here — a path can legitimately end
 * in `.`/`)` etc. (e.g. `foo.test.ts`), and the picker always inserts a
 * trailing space anyway.
 */
export function translateFileMentions(text: string): string {
  return text
    .replace(FILE_MENTION_QUOTED_RE, '$1@"$2"')
    .replace(FILE_MENTION_BARE_RE, '$1@$2');
}

/**
 * `@` at string start or preceded by whitespace/`(`/`[`/`{`, followed by a
 * quoted (`@"a b"` / `@'a b'`) or bare (`\S+`) token. A mention is only
 * treated as an agent when the WHOLE token equals a known agent name, so a
 * bare file path like `@build/x.ts` is never swallowed as agent `build`.
 */
const MENTION_RE = /(^|[\s([{])@("([^"]+)"|'([^']+)'|(\S+))/g;

/** Trailing prose punctuation stripped from a bare token before name matching. */
const TRAILING_PUNCT_RE = /[.,;:!?)\]}]+$/;

/**
 * Find every `@token` whose name matches a known agent. Returns each
 * occurrence (duplicates included) with the span covering `@token`, so the
 * caller can remove all of them; `translateAgentMentions` dedupes the names.
 */
export function extractAgentMentions(text: string, agentNames: readonly string[]): AgentMentionMatch[] {
  const known = new Set(agentNames.map((name) => name.toLowerCase()));
  const matches: AgentMentionMatch[] = [];

  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index + m[1].length;
    const quoted = m[3] ?? m[4];

    // Quoted tokens: name is the inner text verbatim; span covers `@` + quotes.
    if (quoted !== undefined) {
      if (!known.has(quoted.toLowerCase())) continue;
      matches.push({ name: quoted, start, end: start + 1 + (m[2] ?? '').length });
      continue;
    }

    // Bare tokens: strip trailing punctuation before comparing (e.g. `@architect.`).
    const cleaned = (m[5] ?? '').replace(TRAILING_PUNCT_RE, '');
    if (!known.has(cleaned.toLowerCase())) continue;
    matches.push({ name: cleaned, start, end: start + 1 + cleaned.length });
  }

  return matches;
}

/**
 * Close the gaps left by removed mentions without touching the body's own
 * whitespace.
 *
 * The rule this replaced ran `[ \t]+ → ' '` and `\n{2,} → '\n'` over the WHOLE
 * body, which is a markdown reflow: for `@architect\n\nDescribe it\n\n---\n\nDo
 * X` the blank line before `---` disappeared, so the divider landed under the
 * paragraph as a setext H2 underline instead of a thematic break, and the
 * user's own paragraphs merged into one.
 *
 * A removal gap is the token, plus the run of spaces or tabs that followed it
 * (the span already excludes the separator before it). Only the mention's OWN
 * line is at stake: a mention that occupied its line takes that line's newline
 * with it, while the whitespace the USER wrote between the body's own words is
 * never touched — the old rule reflowed all of it, and dropped every blank line
 * on the way.
 */
function collapseRemovedMentions(text: string, matches: readonly AgentMentionMatch[]): string {
  let body = text;
  let offset = 0;
  for (const match of matches) {
    const at = match.start - offset;
    let end = at + 1;
    while (end < body.length && !/\s/.test(body[end]!)) end += 1;

    let lineStart = at;
    while (lineStart > 0 && body[lineStart - 1] !== '\n') lineStart -= 1;
    const onlyMentionOnLine =
      body[lineStart] === '@'
      && (end >= body.length || body[end] === '\n');

    if (onlyMentionOnLine) {
      // `^…@mention\n` — drop the line and the newline that terminated it.
      const cutEnd = end < body.length ? end + 1 : end;
      offset += cutEnd - lineStart;
      body = body.slice(0, lineStart) + body.slice(cutEnd);
      continue;
    }

    // Inline (or a mention followed by the user's own text on its line): the gap
    // is the token plus the run of spaces after it. Collapsing exactly that much
    // keeps `@a then @b go` from leaving a double space while stopping well
    // short of the old whole-body reflow (the body's own `do   it` stays).
    let gapEnd = end;
    while (gapEnd < body.length && (body[gapEnd] === ' ' || body[gapEnd] === '\t')) gapEnd += 1;
    offset += gapEnd - at;
    body = body.slice(0, at) + body.slice(gapEnd);
  }
  return body.trim();
}

/**
 * Rewrite `@agent` mentions into an explicit delegation directive the omp
 * model acts on (oh-my-pi has no native `@agent` syntax). Pure and
 * deterministic: no mentions leave the text untouched.
 */
export function translateAgentMentions(
  text: string,
  agentNames: readonly string[],
): { text: string; agents: string[] } {
  const matches = extractAgentMentions(text, agentNames);
  if (matches.length === 0) return { text, agents: [] };

  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const key = match.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(match.name);
  }

  const body = collapseRemovedMentions(text, matches);

  if (body === '') return { text, agents: names };

  return {
    text: `Use the task tool to delegate this request to the following oh-my-pi subagent(s): ${names
      .map((n) => `\`${n}\``)
      .join(', ')} (agent id: ${names.join(', ')}).\n\n${body}`,
    agents: names,
  };
}
