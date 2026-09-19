/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { json, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { readdirSync, statSync } from 'fs';
import fs from 'fs';
import path from 'path';
import { isMockMode } from '@/server/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/server/lib/fs/root';

/**
 * GET /api/fs/browse?path=<abs> — list subdirectories of a folder for the
 * workspace folder picker.
 *
 * Starts from the OS home directory when `path` is omitted. Only directories
 * are returned (a workspace is bound to a project root folder). Navigation is
 * confined to real absolute paths; entries that cannot be read are skipped so
 * one permission-denied folder does not break the whole listing.
 *
 * Response: { path, parentPath, directories: [{ name, path }] }
 */
const HIDDEN_ENTRY_PREFIXES = ['.', 'node_modules', 'Library'];

export async function browseDirectories({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get('path');
  const home = homedir();

  let current: string;
  if (rawPath) {
    const candidate = rawPath.startsWith('~/')
      ? join(home, rawPath.slice(2))
      : rawPath === '~'
        ? home
        : rawPath;
    if (!isAbsolute(candidate)) {
      return json({ error: 'Path must be absolute', code: 'not_absolute' }, { status: 400 });
    }
    current = resolve(candidate);
  } else {
    current = home;
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(current, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !HIDDEN_ENTRY_PREFIXES.some((p) => d.name.startsWith(p)))
      .map((d) => d.name);
  } catch {
    return json({ error: `Cannot read directory: ${current}`, code: 'unreadable' }, { status: 400 });
  }

  const directories = entries
    .map((name) => {
      const full = join(current, name);
      try {
        // Skip symlinks that point outside the tree or are broken; follow
        // only real directories.
        if (!statSync(full).isDirectory()) return null;
        return { name, path: full };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { name: string; path: string } => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = current === home ? null : dirname(current);
  return json({
    path: current,
    parentPath: parent === current ? null : parent,
    directories,
  });
}

// Lazy listing: return only the immediate children of a directory. Folders are
// emitted with `children: null` meaning "not loaded yet" so the client can
// fetch them on demand — directories are NOT recursed here (keeps the initial
// payload tiny for deep workspaces).
function listEntries(dirPath: string, rootPath: string): any[] {
  const entries = fs.readdirSync(dirPath)
    .filter(child => !child.startsWith('.') && child !== 'node_modules' && child !== '.git' && child !== 'dist' && child !== 'build')
    .map(child => {
      const full = path.join(dirPath, child);
      try {
        const st = fs.statSync(full);
        const rel = path.relative(rootPath, full);
        if (st.isDirectory()) {
          return { id: rel, name: child, type: 'folder', path: rel, children: null, is_expanded: 0 };
        }
        return { id: rel, name: child, type: 'file', path: rel };
      } catch {
        return null; // unreadable entry / broken symlink — skip
      }
    })
    .filter((x): x is any => Boolean(x));

  entries.sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export async function listDirectory({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mock = isMockMode();
  let baseDir = await resolveRoot(url.searchParams.get('root'), await getDefaultFsRoot(mock));

  // Browse inside a nested git repo; emitted paths are repo-relative to match GitPanel.
  const repo = url.searchParams.get('repo');
  if (repo && repo !== '.') {
    const repoDir = path.resolve(baseDir, repo);
    if (repoDir !== baseDir && !repoDir.startsWith(baseDir + path.sep)) {
      return json({ error: 'Invalid repo path' }, { status: 403 });
    }
    baseDir = repoDir;
  }

  const targetPath = url.searchParams.get('path') || '.';
  const fullPath = path.resolve(baseDir, targetPath);

  // Security check to prevent traversing outside the scoped root
  if (fullPath !== baseDir && !fullPath.startsWith(baseDir + path.sep)) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    const files = listEntries(fullPath, baseDir);
    return json({ files, isMock: mock, root: baseDir, path: targetPath });
  } catch (error) {
    console.error(error);
    return json({ error: 'Failed to read directory', isMock: mock }, { status: 500 });
  }
}

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

export async function listFiles({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mock = isMockMode();
  const baseDir = await resolveRoot(url.searchParams.get('root'), await getDefaultFsRoot(mock));

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

export async function readFile({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');

  if (!filePath) {
    return json({ error: 'Missing path' }, { status: 400 });
  }

  let baseDir = await resolveRoot(url.searchParams.get('root'), await getDefaultFsRoot(isMockMode()));

  // If repo is specified (e.g. nested git project), resolve inside the repo
  const repo = url.searchParams.get('repo');
  if (repo && repo !== '.') {
    const repoDir = path.resolve(baseDir, repo);
    if (repoDir === baseDir || repoDir.startsWith(baseDir + path.sep)) {
      baseDir = repoDir;
    }
  }

  const cleanPath = filePath.replace(/^\/+/, '');
  const fullPath = path.resolve(baseDir, cleanPath);

  if (fullPath !== baseDir && !fullPath.startsWith(baseDir + path.sep)) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      return json({ error: 'File not found' }, { status: 404 });
    }
    if ((await file.stat()).isDirectory()) {
      return json({ error: 'Cannot read a directory' }, { status: 400 });
    }

    const content = await file.text();
    return json({ content });
  } catch (error: any) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
