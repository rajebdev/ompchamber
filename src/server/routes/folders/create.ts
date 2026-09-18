/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * POST /api/folders — create a workspace folder (user action, real mode).
 *
 * Body: { name?: string, path?: string }
 *
 * A workspace folder is the user's own grouping over an oh-my-pi project. When
 * `path` is provided the folder is bound to that project root (project_path),
 * so its session items are filled from the omp JSONL discovery; the folder
 * name defaults to the lowercase basename of the path. When only `name` is
 * given, an unbound folder is created (no auto sessions).
 *
 * The path must exist and be a directory; no project discovery is implied —
 * the user explicitly chooses what to add.
 */

import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs } from '@/server/lib/remix-compat';
import { statSync } from 'fs';
import { basename, resolve } from 'path';
import { homedir } from 'os';
import { getDb } from '@/server/db.server';

function expandHome(value: string): string {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return resolve(homedir(), value.slice(2));
  return resolve(value);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: { name?: unknown; path?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  const rawPath = typeof body.path === 'string' ? body.path.trim() : '';

  const db = await getDb();

  // Existing-name guard (case-insensitive) so the sidebar list stays unique.
  const dup = await db.get('SELECT id FROM workspace_folders WHERE lower(name) = lower(?)', [
    rawName || basename(expandHome(rawPath || '~')).toLowerCase(),
  ]);
  if (dup) {
    return json({ error: 'A workspace with this name already exists', code: 'duplicate_name' }, { status: 400 });
  }

  let name = rawName;
  let projectPath: string | null = null;

  if (rawPath) {
    const candidate = expandHome(rawPath);
    try {
      if (!statSync(candidate).isDirectory()) {
        return json({ error: `Not a directory: ${rawPath}`, code: 'not_a_directory' }, { status: 400 });
      }
    } catch {
      return json({ error: `Directory does not exist: ${rawPath}`, code: 'directory_not_found' }, { status: 400 });
    }
    projectPath = candidate;
    if (!name) name = basename(candidate).toLowerCase();
  }

  if (!name) {
    return json({ error: 'Workspace name is required', code: 'name_required' }, { status: 400 });
  }

  if (projectPath) {
    await db.run('DELETE FROM deleted_workspaces WHERE project_path = ?', [projectPath]);
  }

  const result = await db.run(
    'INSERT INTO workspace_folders (name, is_expanded, project_path) VALUES (?, 1, ?)',
    [name, projectPath],
  );

  return json({ success: true, folder: { id: result.lastID, name, project_path: projectPath } });
}
