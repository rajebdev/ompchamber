/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native OMP agent discovery — reads agent definition markdown files from
 * ~/.omp/agent/agents and <project>/.omp/agents so the settings agents list
 * surfaces the same agent definitions the omp agent loads. Discovery is
 * read-only: chamber never mutates native agent files.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getAgentDir } from '@/lib/omp/core/paths';

export interface DiscoveredAgent {
  id: string;
  name: string;
  description: string;
  mode: 'primary' | 'subagent' | 'all';
  overrideModel?: string;
  thinkingVariant?: string;
  temperature?: number | null;
  topP?: number | null;
  systemPrompt: string;
  /** Which disk root the agent was discovered from. */
  sourceRoot: 'user' | 'project';
  filePath: string;
}

/** Minimal YAML frontmatter (---\nkey: value\n---) parser for agent files. */
function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, body: text.slice(match[0].length) };
}

function toMode(value: string | undefined): 'primary' | 'subagent' | 'all' {
  return value === 'primary' || value === 'subagent' || value === 'all' ? value : 'all';
}

function parseAgentFile(filePath: string, sourceRoot: 'user' | 'project'): DiscoveredAgent | undefined {
  try {
    if (statSync(filePath).size > 512 * 1024) return undefined;
    const text = readFileSync(filePath, 'utf8');
    const { data, body } = parseFrontmatter(text);
    const base = filePath.split('/').pop()?.replace(/\.md$/, '') || filePath;
    const name = data.name || base;
    if (!name) return undefined;
    const temperature = data.temperature !== undefined && data.temperature !== '' ? Number(data.temperature) : null;
    const topP = data.top_p !== undefined && data.top_p !== '' ? Number(data.top_p) : null;
    return {
      id: `omp-${sourceRoot}-${base}`,
      name,
      description: data.description || '',
      mode: toMode(data.mode),
      overrideModel: data.model || undefined,
      thinkingVariant: data.thinking || undefined,
      temperature: Number.isFinite(temperature) ? temperature : null,
      topP: Number.isFinite(topP) ? topP : null,
      systemPrompt: body.trim(),
      sourceRoot,
      filePath,
    };
  } catch {
    return undefined;
  }
}

function scanAgentsDir(dir: string, sourceRoot: 'user' | 'project'): DiscoveredAgent[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .flatMap((entry) => {
        const agent = parseAgentFile(join(dir, entry.name), sourceRoot);
        return agent ? [agent] : [];
      });
  } catch {
    return [];
  }
}

/**
 * Discover native agents from both disk roots. User agents win over project
 * agents with the same file base name. Never throws.
 */
export function discoverNativeAgents(projectDir?: string): DiscoveredAgent[] {
  const userDir = join(getAgentDir(), 'agents');
  const byBase = new Map<string, DiscoveredAgent>();
  for (const agent of scanAgentsDir(userDir, 'user')) {
    byBase.set(agent.filePath.split('/').pop() ?? agent.id, agent);
  }
  if (projectDir) {
    for (const agent of scanAgentsDir(projectDir, 'project')) {
      const base = agent.filePath.split('/').pop() ?? agent.id;
      if (!byBase.has(base)) byBase.set(base, agent);
    }
  }
  return [...byBase.values()];
}
