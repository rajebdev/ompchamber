/**
 * Server-side helper for resolving the "scoped root" the right-panel developer
 * tools (Files / Search / Git / Terminal) operate on.
 *
 * A session row belongs to a workspace folder; when that folder is bound to an
 * oh-my-pi project (project_path), selecting one of its sessions should make
 * every right panel work inside that real project directory instead of the
 * ompchamber app directory. This module keeps that opt-in capability safe:
 * arbitrary client paths are rejected — a root is only honored when it is the
 * app root, a directory below it, or an exact registered workspace project
 * path from the SQLite database.
 */

import path from 'path';
import fs from 'fs';
import { getDb } from '@/db.server';

const APP_ROOT = process.cwd();

/**
 * Default browsing root when no session-bound project is active. Mock/demo
 * mode browses the bundled `examples` tree; real mode browses the app root.
 */
export function getDefaultFsRoot(mock: boolean): string {
  if (mock) {
    const examplesDir = path.join(APP_ROOT, 'examples');
    if (fs.existsSync(examplesDir)) return examplesDir;
  }
  return APP_ROOT;
}

/**
 * Resolve a client-supplied `root` (query param or form field) to a directory
 * the server is allowed to operate on.
 *
 * Returns `fallback` when `rawRoot` is missing, does not exist, or is not on
 * the allow-list (app root / subpath / registered project_path), so existing
 * callers keep their previous behavior for unscoped requests.
 */
export async function resolveRoot(
  rawRoot: string | null | undefined,
  fallback: string
): Promise<string> {
  if (!rawRoot || !rawRoot.trim()) return fallback;

  const resolved = path.resolve(rawRoot.trim());

  // Fast path: the app root and anything beneath it are always allowed.
  if (resolved === APP_ROOT || resolved.startsWith(APP_ROOT + path.sep)) {
    return fs.existsSync(resolved) ? resolved : fallback;
  }

  // Registered workspaces are user-opted project roots — allow exact matches.
  try {
    const db = await getDb();
    const row = await db.get(
      'SELECT project_path FROM workspace_folders WHERE project_path IS NOT NULL AND project_path = ? LIMIT 1',
      [resolved]
    );
    if (row && fs.existsSync(resolved)) return resolved;
  } catch {
    // Database unavailable — fall through to the safe fallback.
  }

  return fallback;
}
