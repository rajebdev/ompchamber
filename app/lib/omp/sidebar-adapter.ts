/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Adapter from oh-my-pi discovery data to the chamber folder model.
 *
 * Folders are the SQLite-managed workspaces (id, name, isExpanded,
 * project_path). This module produces the *session items* that fill those
 * folders from the omp JSONL scan, and mirrors omp's project ordering so the
 * folders list can be seeded/refreshed consistently.
 *
 * Session items carry the omp session UUID as their id — a session belongs to
 * the folder whose project_path equals its resolved project root.
 */

import type { OmpSession, OmpSidebarData, OmpProject } from '@/types/omp';

/** Display title of a session: name, else first message, else fallback. */
export function sessionTitleFor(session: OmpSession): string {
  if (session.name?.trim()) return session.name;
  const first = (session.firstMessage || '').trim();
  if (first && first !== '(no messages)') return first.slice(0, 120);
  return 'Untitled session';
}

/** Project display name: alias, else lowercase basename of the path. */
export function projectDisplayName(project: OmpProject): string {
  if (project.alias?.trim()) return project.alias.trim();
  const trimmed = project.path.replace(/[\\/]+$/, '');
  const base = trimmed.split(/[\\/]/).pop() || project.path;
  return (base || project.path).toLowerCase();
}

/** Omp-side ordering of projects: sortOrder, then addedAt desc. */
export function compareOmpProjects(a: OmpProject, b: OmpProject): number {
  const aOrder = a.sortOrder ?? Number.POSITIVE_INFINITY;
  const bOrder = b.sortOrder ?? Number.POSITIVE_INFINITY;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return (b.addedAt ?? '').localeCompare(a.addedAt ?? '');
}

/** Map sessions into per-project-root buckets (newest-modified first). */
export function groupSessionsByRoot(sessions: OmpSession[]): Map<string, OmpSession[]> {
  const byRoot = new Map<string, OmpSession[]>();
  for (const session of sessions) {
    const root = session.projectRoot || session.cwd || '';
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(session);
    else byRoot.set(root, [session]);
  }
  for (const bucket of byRoot.values()) {
    bucket.sort((a, b) => b.modified.localeCompare(a.modified));
  }
  return byRoot;
}

/**
 * Build the ordered project list used to seed workspace folders:
 * registered projects (sortOrder/addedAt) first, then discovered extras
 * (path-sorted) — mirroring omp-web's mergeProjects ordering.
 */
export function orderedOmpProjects(data: OmpSidebarData): OmpProject[] {
  const registered = data.projects.filter((p) => !p.discovered).sort(compareOmpProjects);
  const discovered = data.projects.filter((p) => p.discovered).sort((a, b) => a.path.localeCompare(b.path));
  return [...registered, ...discovered];
}
