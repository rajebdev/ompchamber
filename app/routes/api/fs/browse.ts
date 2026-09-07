/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { readdirSync, statSync } from 'fs';

const HIDDEN_ENTRY_PREFIXES = ['.', 'node_modules', 'Library'];

export async function loader({ request }: LoaderFunctionArgs) {
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
