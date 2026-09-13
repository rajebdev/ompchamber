import { json, type LoaderFunctionArgs } from '@remix-run/node';
import fs from 'fs';
import path from 'path';
import { isMockMode } from '@/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/lib/fs/root';

/** Hard cap on emitted files so a huge tree cannot stall the request. */
const MAX_FILES = 3000;

/** Directory names that are never recursed into. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage']);

interface ListFileEntry {
  name: string;
  path: string;
}

/**
 * Recursively collect files under `dir`, emitting each as a workspace-relative
 * path from `baseDir`. Hidden entries, skip-listed dirs, and symlinks (which
 * could cycle) are ignored; unreadable directories are skipped silently.
 */
function walk(dir: string, baseDir: string, out: ListFileEntry[]): void {
  if (out.length >= MAX_FILES) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;

    if (entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), baseDir, out);
      continue;
    }

    // Emit only regular files: symlinks (to files or dirs) are skipped so a
    // directory symlink cannot introduce a cycle.
    if (!entry.isFile()) continue;

    const rel = path.relative(baseDir, path.join(dir, entry.name)).split(path.sep).join('/');
    out.push({ name: entry.name, path: rel });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mock = isMockMode();
  const baseDir = await resolveRoot(url.searchParams.get('root'), getDefaultFsRoot(mock));

  try {
    const files: ListFileEntry[] = [];
    walk(baseDir, baseDir, files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return json({ files, root: baseDir, truncated: files.length >= MAX_FILES });
  } catch (error) {
    console.error(error);
    return json({ error: 'Failed to list files' }, { status: 500 });
  }
}
