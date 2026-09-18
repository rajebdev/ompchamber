/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native OMP skill discovery — scans SKILL.md files under ~/.omp/agent/skills
 * and <project>/.omp/skills so the settings skills list reflects the skills
 * the omp agent actually loads. Supports atomic frontmatter toggles
 * (disableModelInvocation) for real skill files.
 */

import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';

const MAX_SKILL_MD_BYTES = 512 * 1024;

export interface DiscoveredSkill {
  id: string;
  name: string;
  description: string;
  /** Which disk root the skill was discovered from. */
  sourceRoot: 'user' | 'project';
  filePath: string;
}

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

function parseSkillMd(filePath: string, sourceRoot: 'user' | 'project'): DiscoveredSkill | undefined {
  try {
    if (statSync(filePath).size > MAX_SKILL_MD_BYTES) return undefined;
    const text = readFileSync(filePath, 'utf8');
    const { data } = parseFrontmatter(text);
    const name = data.name || filePath.split('/').slice(-2, -1)[0] || '';
    if (!name) return undefined;
    return {
      id: `omp-${sourceRoot}-${name}`,
      name,
      description: data.description || '',
      sourceRoot,
      filePath,
    };
  } catch {
    return undefined;
  }
}

/**
 * Scan one skill root: either a flat dir of skill folders (each containing a
 * SKILL.md) or nested layouts — any SKILL.md within depth 2 is accepted.
 */
function scanSkillRoot(root: string, sourceRoot: 'user' | 'project'): DiscoveredSkill[] {
  if (!existsSync(root)) return [];
  const found: DiscoveredSkill[] = [];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = join(root, entry.name, 'SKILL.md');
      const skill = parseSkillMd(skillMd, sourceRoot);
      if (skill) found.push(skill);
    }
  } catch {
    // Unreadable root yields no skills rather than throwing.
  }
  return found;
}

/**
 * Discover native skills from user + optional project roots. User skills win
 * over project skills with the same folder name. Never throws.
 */
export function discoverNativeSkills(projectDir?: string): DiscoveredSkill[] {
  const userRoot = join(getAgentDir(), 'skills');
  const projectRoot = projectDir ? join(projectDir, '.omp', 'skills') : undefined;
  const byName = new Map<string, DiscoveredSkill>();
  for (const skill of scanSkillRoot(userRoot, 'user')) byName.set(skill.name, skill);
  if (projectRoot) {
    for (const skill of scanSkillRoot(projectRoot, 'project')) {
      if (!byName.has(skill.name)) byName.set(skill.name, skill);
    }
  }
  return [...byName.values()];
}

/**
 * Atomically toggle `disableModelInvocation` in a SKILL.md frontmatter —
 * read-modify-write via temp+rename, preserving the rest of the file.
 */
export function setSkillModelInvocation(filePath: string, disable: boolean): boolean {
  try {
    if (!existsSync(filePath) || statSync(filePath).size > MAX_SKILL_MD_BYTES) return false;
    const text = readFileSync(filePath, 'utf8');
    const flag = `disableModelInvocation: ${disable}`;
    let next: string;
    if (/^---\r?\n[\s\S]*?\r?\n---/.test(text)) {
      if (/^disableModelInvocation:/m.test(text)) {
        next = text.replace(/^disableModelInvocation:.*$/m, flag);
      } else {
        // Insert before the closing --- of the frontmatter.
        next = text.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (full, front) => {
          void full;
          return `---\n${front}\n${flag}\n---`;
        });
      }
    } else {
      next = `---\n${flag}\n---\n\n${text}`;
    }
    if (next === text) return false;
    const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temp, next, 'utf8');
    renameSync(temp, filePath);
    return true;
  } catch {
    return false;
  }
}
