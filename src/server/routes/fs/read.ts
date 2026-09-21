/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { json, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { errorResponse } from '@/server/lib/route-adapter';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import fs from 'fs';
import path from 'path';
import { isMockMode } from '@/server/mock.server';
import { getDefaultFsRoot, resolveRoot, resolveWithinRoot } from '@/server/lib/fs/root';
import { collectIgnoredPaths } from '@/server/lib/fs/git-ignore';

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
    entries = (await fs.promises.readdir(current, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !HIDDEN_ENTRY_PREFIXES.some((p) => d.name.startsWith(p)))
      .map((d) => d.name);
  } catch {
    return json({ error: `Cannot read directory: ${current}`, code: 'unreadable' }, { status: 400 });
  }

  const directories = (
    await Promise.all(
      entries.map(async (name) => {
        const full = join(current, name);
        try {
          // Skip symlinks that point outside the tree or are broken; follow
          // only real directories.
          if (!(await Bun.file(full).stat()).isDirectory()) return null;
          return { name, path: full };
        } catch {
          return null;
        }
      }),
    )
  )
    .filter((entry): entry is { name: string; path: string } => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = current === home ? null : dirname(current);
  return json({
    path: current,
    parentPath: parent === current ? null : parent,
    directories,
  });
}

/**
 * Names never listed in the Files panel: dependency/build output and the git
 * object database. Skipped for being noise, not for being hidden — every other
 * entry is listed, dot-prefixed files and folders included.
 */
const NOISE_DIRS: Record<string, true> = { node_modules: true, '.git': true, dist: true, build: true };

// Lazy listing: return only the immediate children of a directory. Folders are
// emitted with `children: null` meaning "not loaded yet" so the client can
// fetch them on demand — directories are NOT recursed here (keeps the initial
// payload tiny for deep workspaces). Hidden (dot-prefixed) entries are part of
// the listing: lazy children keep `.github`, `.config`, `.env`, … cheap.
// Entries git would refuse to track carry `ignored: true` so the panel can dim
// them; that is one `git check-ignore` per listing, never one per entry.
async function listEntries(dirPath: string, rootPath: string): Promise<any[]> {
  const listed = (await fs.promises.readdir(dirPath))
    .filter(child => !NOISE_DIRS[child])
    .map(child => {
      const full = path.join(dirPath, child);
      return { child, full, rel: path.relative(rootPath, full) };
    });

  const ignored = await collectIgnoredPaths(rootPath, listed.map(entry => entry.rel));

  const mapped = await Promise.all(listed.map(async ({ child, full, rel }) => {
    try {
      const st = await Bun.file(full).stat();
      const isIgnored = ignored.has(rel);
      if (st.isDirectory()) {
        return { id: rel, name: child, type: 'folder', path: rel, children: null, is_expanded: 0, ignored: isIgnored };
      }
      return { id: rel, name: child, type: 'file', path: rel, ignored: isIgnored };
    } catch {
      return null; // unreadable entry / broken symlink — skip
    }
  }));

  const result = mapped.filter((x): x is any => Boolean(x));

  result.sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

export async function listDirectory({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mock = isMockMode();
  let baseDir = await resolveRoot(url.searchParams.get('root'), await getDefaultFsRoot(mock));

  // Browse inside a nested git repo; emitted paths are repo-relative to match GitPanel.
  const repo = url.searchParams.get('repo');
  if (repo && repo !== '.') {
    const repoDir = resolveWithinRoot(baseDir, repo);
    if (!repoDir) {
      return json({ error: 'Invalid repo path' }, { status: 403 });
    }
    baseDir = repoDir;
  }

  const targetPath = url.searchParams.get('path') || '.';
  const fullPath = resolveWithinRoot(baseDir, targetPath);

  // Security check to prevent traversing outside the scoped root
  if (!fullPath) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    const files = await listEntries(fullPath, baseDir);
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
async function walk(dir: string, baseDir: string, out: ListFileEntry[]): Promise<void> {
  if (out.length >= MAX_FILES) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;

    if (entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), baseDir, out);
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
    await walk(baseDir, baseDir, files);
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
    const repoDir = resolveWithinRoot(baseDir, repo);
    if (repoDir) {
      baseDir = repoDir;
    }
  }

  const cleanPath = filePath.replace(/^\/+/, '');
  const fullPath = resolveWithinRoot(baseDir, cleanPath);

  if (!fullPath) {
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
  } catch (error) {
    return errorResponse(error);
  }
}
