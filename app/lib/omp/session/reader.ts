/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only orchestrator over the oh-my-pi agent directory — the OMPChamber
 * analog of omp-web's lib/session-reader.ts sidebar data path.
 *
 * Composes the pieces of the omp-web sidebar data source so a future UI fork
 * can consume "which workspaces exist and which sessions live under them"
 * without touching omp-web or oh-my-pi:
 *
 *   - session file scan          → lib/omp/session-files.ts
 *   - cwd → repository root      → lib/omp/worktree.ts
 *   - managed projects registry  → lib/omp/project-registry.ts
 *
 * All reads are bounded (4 KiB prefix per session file), cached by mtime, and
 * never mutate the agent's files.
 */

import { existsSync } from 'fs';
import { listAllSessionInfos, type OmpSessionInfo } from '@/lib/omp/session/files';
import { loadProjectRegistry, mergeProjects } from '@/lib/omp/core/registry';
import { resolveProjectRoot } from '@/lib/omp/core/worktree';
import { getAgentDir, getSessionsDir } from '@/lib/omp/core/paths';
import type { OmpProject, OmpSession, OmpSidebarData } from '@/types/omp/session';

const CONCURRENCY = 6;

/** Resolve each unique cwd to its project root; bounded concurrency so 100+
 *  unique cwds don't spawn 100 parallel git processes. */
async function resolveRootsByCwd(cwds: string[]): Promise<Map<string, string>> {
  const projectByCwd = new Map<string, string>();
  for (let i = 0; i < cwds.length; i += CONCURRENCY) {
    const chunk = cwds.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (cwd) => {
        projectByCwd.set(cwd, await resolveProjectRoot(cwd));
      }),
    );
  }
  return projectByCwd;
}

/** Map a scanned session file to the sidebar session shape. */
function toOmpSession(
  info: OmpSessionInfo,
  projectRootByCwd: Map<string, string>,
): OmpSession {
  const projectRoot = info.cwd ? projectRootByCwd.get(info.cwd) : undefined;
  return {
    path: info.path,
    id: info.id,
    cwd: info.cwd,
    name: info.title,
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    messageCount: info.messageCount,
    firstMessage: info.firstMessage,
    ...(info.parentSessionPath ? { parentSessionId: info.parentSessionPath } : {}),
    projectRoot,
  };
}

/** Workspaces that own at least one session file on disk (session-discovered). */
function discoveredProjectPaths(sessions: OmpSessionInfo[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const session of sessions) {
    if (!session.cwd) continue;
    if (seen.has(session.cwd)) continue;
    seen.add(session.cwd);
    out.push(session.cwd);
  }
  return out;
}

/**
 * Load the complete sidebar dataset in omp-web's shape:
 * registered + discovered projects, plus every session (newest first).
 */
export async function loadOmpSidebarData(): Promise<OmpSidebarData> {
  const agentDir = getAgentDir();
  const sessionsDir = getSessionsDir();
  const available = existsSync(sessionsDir);

  const ompSessions = listAllSessionInfos(sessionsDir);
  const projectRootByCwd = await resolveRootsByCwd(
    [...new Set(ompSessions.map((s) => s.cwd).filter(Boolean))],
  );

  const registry = loadProjectRegistry();
  const projects = mergeProjects(registry, discoveredProjectPaths(ompSessions));
  const sessions = ompSessions.map((info) => toOmpSession(info, projectRootByCwd));

  return {
    projects,
    sessions,
    agentDir,
    available,
    generatedAt: new Date().toISOString(),
  };
}

/** Convenience: only the project list (cheap — no per-session git lookups). */
export async function loadOmpProjects(): Promise<OmpProject[]> {
  const sessionsDir = getSessionsDir();
  const ompSessions = existsSync(sessionsDir) ? listAllSessionInfos(sessionsDir) : [];
  const registry = loadProjectRegistry();
  return mergeProjects(registry, discoveredProjectPaths(ompSessions));
}
