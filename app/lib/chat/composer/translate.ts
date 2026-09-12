export interface AgentMentionMatch {
  name: string;
  start: number;
  end: number;
}

/** `@` at string start or preceded by whitespace/`(`/`[`/`{`, followed by a token. */
const MENTION_RE = /(^|[\s([{])@([A-Za-z0-9_-]+)/g;

/**
 * Find every `@token` whose name matches a known agent. Returns each
 * occurrence (duplicates included) with the span covering `@token`, so the
 * caller can remove all of them; `translateAgentMentions` dedupes the names.
 */
export function extractAgentMentions(text: string, agentNames: readonly string[]): AgentMentionMatch[] {
  const known = new Set(agentNames.map((name) => name.toLowerCase()));
  const matches: AgentMentionMatch[] = [];

  for (const m of text.matchAll(MENTION_RE)) {
    const name = m[2];
    if (!known.has(name.toLowerCase())) continue;
    matches.push({ name, start: m.index + m[1].length, end: m.index + m[0].length });
  }

  return matches;
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

  let body = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    body = body.slice(0, match.start) + body.slice(match.end);
  }
  body = body.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();

  if (body === '') return { text, agents: names };

  return {
    text: `Use the task tool to delegate this request to the following oh-my-pi subagent(s): ${names
      .map((n) => `\`${n}\``)
      .join(', ')} (agent id: ${names.join(', ')}).\n\n${body}`,
    agents: names,
  };
}
