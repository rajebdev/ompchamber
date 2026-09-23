/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Additive-only folder ↔ omp project sync: creates a workspace folder for
 * every project discovered from ~/.omp/agent (folder name = lowercase
 * basename, bound via project_path). It never modifies or deletes existing
 * user data — no renames, no re-binding of unbound folders — and it skips
 * projects the user has explicitly deleted (tombstoned in
 * `deleted_workspaces`), so a deleted workspace stays deleted.
 */

import type { DbClient } from '@/server/lib/db/client';
import { projectPathKey } from '@/server/lib/omp/core/paths';
import { loadOmpSidebarData } from '@/server/lib/omp/session/reader';
import { orderedOmpProjects, projectDisplayName } from '@/shared/lib/omp/session/sidebar';

/** SYNC_WORKSPACE env flag (default true when unset). When enabled in real
 *  mode, workspace folders are auto-created from discovered omp projects. */
function isWorkspaceSyncEnabled(): boolean {
  const raw = (Bun.env.SYNC_WORKSPACE || '').trim().toLowerCase();
  if (raw === '') return true;
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'no';
}

/**
 * Real-data workspace bootstrap: sync discovered omp projects into
 * `workspace_folders` when SYNC_WORKSPACE allows it. Discovery must never
 * block app startup, so a failure is logged rather than thrown.
 */
export async function syncWorkspaceFoldersFromDiscovery(db: DbClient): Promise<void> {
  if (!isWorkspaceSyncEnabled()) return;
  try {
    await syncWorkspaceFoldersWithOmp(db);
  } catch (err) {
    // Discovery must never block app startup.
    console.error('OMP workspace sync failed:', err);
  }
}

async function syncWorkspaceFoldersWithOmp(db: DbClient): Promise<void> {
  const data = await loadOmpSidebarData();
  const existing = await db.all('SELECT id, name, project_path FROM workspace_folders');
  const tombstoned = await db.all('SELECT project_path FROM deleted_workspaces');

  // Compare by canonical key, not raw string: tombstones may predate the
  // directory (unresolved symlink spelling) while project.path is realpath'd.
  const byPath = new Set(existing.map((r) => r.project_path).filter(Boolean).map(projectPathKey));
  const usedNames = new Set(existing.map((r) => (r.name as string).toLowerCase()));
  const deletedPaths = new Set(tombstoned.map((r) => projectPathKey(r.project_path as string)));

  for (const project of orderedOmpProjects(data)) {
    if (deletedPaths.has(projectPathKey(project.path))) continue;
    if (byPath.has(projectPathKey(project.path))) continue;

    const name = projectDisplayName(project);
    let candidate = name;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${name}-${suffix++}`;
    }
    usedNames.add(candidate);
    await db.run(
      'INSERT INTO workspace_folders (name, is_expanded, project_path) VALUES (?, 1, ?)',
      [candidate, project.path],
    );
  }
}
