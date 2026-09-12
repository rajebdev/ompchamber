import type { AgentItem, CommandItem, ComposerPickItem, ComposerPickKind, SkillItem } from '@/types';

const CACHE_TTL_MS = 300_000;

interface CacheEntry {
  data: ComposerPickItem[];
  expiresAt: number;
}

const cache = new Map<ComposerPickKind, CacheEntry>();
const inFlight = new Map<ComposerPickKind, Promise<ComposerPickItem[]>>();

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  const data = (await res.json()) as T;
  if (!data || typeof data !== 'object') {
    throw new Error(`GET ${url} returned malformed JSON`);
  }
  return data;
}

/** Map agent settings into pick items with `@name` tokens. */
export function toAgentPickItems(agents: AgentItem[]): ComposerPickItem[] {
  return agents.map((agent) => ({
    id: `agent-${agent.name}`,
    name: agent.name,
    description: agent.description,
    kind: 'agent',
    source: 'agent',
    token: `@${agent.name}`,
  }));
}

/**
 * Combine commands (`/name`) then skills (`/skill:name`). A skill is skipped
 * when a command already covers its plain name or `skill:<name>`; commands win.
 */
export function mergeCommandAndSkillItems(commands: CommandItem[], skills: SkillItem[]): ComposerPickItem[] {
  const result: ComposerPickItem[] = [];
  const seen = new Set<string>();

  for (const command of commands) {
    const key = command.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `command-${command.name}`,
      name: command.name,
      description: command.description,
      kind: 'command',
      source: 'command',
      token: `/${command.name}`,
    });
  }

  for (const skill of skills) {
    const plain = skill.name.toLowerCase();
    const prefixed = `skill:${plain}`;
    if (seen.has(plain) || seen.has(prefixed)) continue;
    seen.add(prefixed);
    result.push({
      id: `skill-${skill.name}`,
      name: skill.name,
      description: skill.description,
      kind: 'command',
      source: 'skill',
      token: `/skill:${skill.name}`,
    });
  }

  return result;
}

/** Load pick items for a kind, deduping concurrent callers and caching 5 minutes. */
export function loadComposerItems(kind: ComposerPickKind): Promise<ComposerPickItem[]> {
  const cached = cache.get(kind);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);

  const existing = inFlight.get(kind);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const items =
        kind === 'agent'
          ? toAgentPickItems((await fetchJson<{ agents: AgentItem[] }>('/api/settings/agents')).agents)
          : await (async () => {
              const [commands, skills] = await Promise.all([
                fetchJson<{ commands: CommandItem[] }>('/api/settings/commands'),
                fetchJson<{ skills: SkillItem[] }>('/api/settings/skills'),
              ]);
              return mergeCommandAndSkillItems(commands.commands, skills.skills);
            })();
      cache.set(kind, { data: items, expiresAt: Date.now() + CACHE_TTL_MS });
      return items;
    } finally {
      inFlight.delete(kind);
    }
  })();

  inFlight.set(kind, pending);
  return pending;
}

/** Load agent names via the shared agent cache. Never throws. */
export async function loadAgentNames(): Promise<string[]> {
  try {
    const items = await loadComposerItems('agent');
    return items.map((item) => item.name);
  } catch {
    return [];
  }
}

/** Clear the cache (and in-flight dedupe) for one kind or all kinds. */
export function invalidateComposerCache(kind?: ComposerPickKind): void {
  if (kind) {
    cache.delete(kind);
    inFlight.delete(kind);
    return;
  }
  cache.clear();
  inFlight.clear();
}
