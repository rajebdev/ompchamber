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

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';

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
    // Only top-level keys belong to the frontmatter map; indented lines are
    // nested block content (e.g. an `output:` JSON schema) and must not
    // override top-level keys like `description`.
    if (/^\s/.test(line)) continue;
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

/** Escape a frontmatter scalar value into a safe quoted string. */
function fmValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function optionalFmLine(lines: string[], key: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined || value === '') return;
  lines.push(`${key}: ${typeof value === 'number' ? value : fmValue(String(value))}`);
}

export interface AgentFileInput {
  /** File base name without .md (also the agent name unless name is given). */
  fileName: string;
  name?: string;
  description?: string;
  mode?: string;
  model?: string;
  thinking?: string;
  temperature?: number | null;
  topP?: number | null;
  tools?: string[];
  systemPrompt: string;
}

/**
 * Write (create or replace) a user-level agent definition markdown file.
 * Project agents are intentionally not writable from the chamber — the agent
 * dir belongs to omp.
 */
export function writeAgentDefinition(input: AgentFileInput): { path: string } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.fileName)) {
    throw new Error('Agent file name may contain letters, numbers, dots, dashes, and underscores');
  }
  if (!input.systemPrompt.trim()) {
    throw new Error('Agent system prompt cannot be empty');
  }
  const dir = join(getAgentDir(), 'agents');
  const path = join(dir, `${input.fileName}.md`);
  const lines: string[] = ['---'];
  optionalFmLine(lines, 'name', input.name ?? input.fileName);
  optionalFmLine(lines, 'description', input.description);
  optionalFmLine(lines, 'mode', input.mode);
  optionalFmLine(lines, 'model', input.model);
  optionalFmLine(lines, 'thinking-level', input.thinking);
  optionalFmLine(lines, 'temperature', input.temperature ?? null);
  optionalFmLine(lines, 'top_p', input.topP ?? null);
  if (input.tools && input.tools.length > 0) {
    lines.push(`tools: ${input.tools.map(fmValue).join(', ')}`);
  }
  lines.push('---');
  const content = `${lines.join('\n')}\n\n${input.systemPrompt.trim()}\n`;
  mkdirSync(dir, { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, content, 'utf8');
  renameSync(temp, path);
  return { path };
}

export function deleteAgentDefinition(fileName: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(fileName)) throw new Error('Invalid agent file name');
  const path = join(getAgentDir(), 'agents', `${fileName}.md`);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
