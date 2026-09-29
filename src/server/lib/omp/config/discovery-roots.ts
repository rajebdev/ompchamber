/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The directories omp discovers skills and commands from.
 *
 * ONE table, because two consumers need the same answer and must not drift:
 * `locateCommandFile` (which file backs a command name) and the discovery
 * watcher (which directories to watch for a change). They were written
 * separately, and the watcher's copy was short by every root but the omp-native
 * pair — so a skill added to `.claude/skills`, `.codex/skills`, `.opencode`,
 * `.agents` or `.github` in a live session was never noticed.
 *
 * The set below is measured, not assumed (omp 18.4.3, a fresh directory with a
 * `SKILL.md` planted in each candidate and `omp skill list <dir> --json`):
 *
 *   project  .omp/skills     → native:project      ← the chamber may write here
 *            .claude/skills  → claude:project
 *            .codex/skills   → codex:project
 *            .agents/skills  → agents:project
 *            .opencode/skills→ opencode:project
 *            .github/skills  → github:project
 *
 *   user     ~/.omp/agent/skills → native:user      ← the chamber may write here
 *            ~/.agents/skills     → agents:user
 *
 * Everything else was verified NOT read at this level: `~/.claude/skills`,
 * `~/.codex/skills`, `~/.config/opencode/skills` and `~/.opencode/skills` are
 * all ignored by a child started in an unrelated cwd, even though omp does read
 * `~/.claude/commands` and friends for COMMANDS. Do not add a root here on the
 * strength of its command counterpart.
 *
 * Commands and skills share the project roots and the omp-native user root; the
 * registry-backed `~/.agents/skills` is skills-only. `.github` is skills-only
 * too — its command form is `.github/prompts/*.prompt.md`, a different layout
 * that `commands.ts` keeps its own entry for.
 *
 * A `managed` root is one the chamber may write to and delete from; every other
 * root is read-only here, because the chamber is not the tool that put the file
 * there.
 */

import { join } from 'path';
import { getAgentDir } from '@/server/lib/omp/core/paths';

/** A root, relative to a workspace for `project` scope, absolute for `user`. */
export interface DiscoveryRoot {
  /** Directory holding the skill/command entries. */
  dir: string;
  scope: 'user' | 'project';
  /** The chamber owns files here and may write or delete them. */
  managed: boolean;
}

/** Project-scope roots shared by skills and commands, relative to a workspace. */
const PROJECT_ROOTS: Array<{ dir: string; managed: boolean }> = [
  { dir: '.omp/skills', managed: true },
  { dir: '.claude/skills', managed: false },
  { dir: '.codex/skills', managed: false },
  { dir: '.agents/skills', managed: false },
  { dir: '.opencode/skills', managed: false },
  { dir: '.github/skills', managed: false },
];

/** Project-scope COMMAND roots. `.github` differs from its skill counterpart:
 *  VS Code Copilot prompt files live in `.github/prompts` and carry a
 *  `.prompt.md` suffix, which is why the suffix rides along here. */
export const PROJECT_COMMAND_ROOTS: Array<{ dir: string; suffix: string; managed: boolean }> = [
  { dir: '.omp/commands', suffix: '.md', managed: true },
  { dir: '.claude/commands', suffix: '.md', managed: false },
  { dir: '.codex/commands', suffix: '.md', managed: false },
  { dir: '.agents/commands', suffix: '.md', managed: false },
  { dir: '.opencode/commands', suffix: '.md', managed: false },
  { dir: '.github/prompts', suffix: '.prompt.md', managed: false },
];

/** User-scope roots shared by skills and commands. `.omp/agent` comes from the
 *  agent-dir resolution so `PI_CODING_AGENT_DIR` and profiles are honored. */
function userSharedRoots(): Array<{ dir: string; managed: boolean }> {
  return [
    { dir: join(getAgentDir(), 'skills'), managed: true },
    { dir: join(getAgentDir(), 'commands'), managed: true },
  ];
}

/** User-scope roots only skills use. */
function userSkillOnlyRoots(): string[] {
  const home = Bun.env.HOME ?? '';
  return [join(home, '.agents', 'skills')];
}

/** User-scope roots only commands use. */
function userCommandOnlyRoots(): Array<{ dir: string; suffix: string }> {
  const home = Bun.env.HOME ?? '';
  return [
    { dir: join(home, '.claude', 'commands'), suffix: '.md' },
    { dir: join(home, '.codex', 'commands'), suffix: '.md' },
    { dir: join(home, '.agents', 'commands'), suffix: '.md' },
    { dir: join(home, '.config', 'opencode', 'commands'), suffix: '.md' },
  ];
}

/** Every SKILL directory omp reads, for one workspace (or user scope alone). */
export function skillRoots(projectDir?: string | null): DiscoveryRoot[] {
  const roots: DiscoveryRoot[] = [];
  if (projectDir) {
    for (const entry of PROJECT_ROOTS) {
      roots.push({ dir: join(projectDir, entry.dir), scope: 'project', managed: entry.managed });
    }
  }
  for (const entry of userSharedRoots()) {
    // A shared root is a skills root only for its `skills` half.
    if (entry.dir.endsWith('skills')) roots.push({ dir: entry.dir, scope: 'user', managed: entry.managed });
  }
  for (const dir of userSkillOnlyRoots()) roots.push({ dir, scope: 'user', managed: false });
  return roots;
}

/** Every COMMAND directory omp reads, for one workspace (or user scope alone). */
export function commandRoots(projectDir?: string | null): Array<DiscoveryRoot & { suffix: string }> {
  const roots: Array<DiscoveryRoot & { suffix: string }> = [];
  if (projectDir) {
    for (const entry of PROJECT_COMMAND_ROOTS) {
      roots.push({ dir: join(projectDir, entry.dir), suffix: entry.suffix, scope: 'project', managed: entry.managed });
    }
  }
  for (const entry of userSharedRoots()) {
    if (entry.dir.endsWith('commands')) roots.push({ dir: entry.dir, suffix: '.md', scope: 'user', managed: entry.managed });
  }
  for (const entry of userCommandOnlyRoots()) {
    roots.push({ ...entry, scope: 'user', managed: false });
  }
  return roots;
}
