/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nested-repository discovery for the right-panel repo picker.
 *
 * A workspace is often a folder OF repositories (`projects/<name>/<sub>/.git`),
 * so the picker lists every repo under the scoped root. The walk is expensive
 * on a deep tree, so it runs in the BACKGROUND after the loader has already
 * answered with the root's own status; the client polls until `pending` clears.
 * Results are cached per scoped root for the life of the process.
 *
 * The `find` prunes `node_modules` (the one directory guaranteed to hold
 * unrelated `.git` directories, and the one that makes the walk unbounded).
 */

import { runShell } from '@/server/lib/fs/shell';

const MAX_GIT_DEPTH = 8;

async function getRepos(rootDir: string): Promise<string[]> {
  try {
    // Search deep enough to discover nested/child git repos inside a monorepo
    // workspace (e.g. projects/<name>/<sub>/.git) while pruning node_modules.
    const result = await runShell(
      `find . -maxdepth ${MAX_GIT_DEPTH} -name node_modules -prune -o -name .git -type d -print`,
      { cwd: rootDir, timeout: 12000, maxBuffer: 1024 * 1024 }
    );
    const discovered = result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const cleaned = line.replace(/^\.\//, '').replace(/\/\.git$/, '');
        return cleaned === '.git' || !cleaned ? '.' : cleaned;
      });

    const uniqueRepos = Array.from(new Set(discovered));
    if (uniqueRepos.includes('.')) {
      return ['.', ...uniqueRepos.filter(r => r !== '.')];
    }
    return uniqueRepos.length ? uniqueRepos : ['.'];
  } catch {
    return ['.'];
  }
}

interface RepoDiscovery {
  repos: string[];
  done: boolean;
}

const repoDiscovery = new Map<string, RepoDiscovery>();

/** Begin the background walk for `rootDir`; a no-op once one has started. */
export function startRepoScan(rootDir: string): void {
  if (repoDiscovery.has(rootDir)) return;
  const d: RepoDiscovery = { repos: ['.'], done: false };
  repoDiscovery.set(rootDir, d);
  void getRepos(rootDir)
    .then(repos => { d.repos = repos; d.done = true; })
    .catch(() => { d.repos = ['.']; d.done = true; });
}

/**
 * Drop the cached result for `rootDir` and start a fresh walk. Used by the
 * repo-switcher's refresh button, which must not serve the previous answer.
 */
export function rescanRepos(rootDir: string): void {
  repoDiscovery.delete(rootDir);
  startRepoScan(rootDir);
}

/** The discovered repos for `rootDir`, and whether the walk is still running. */
export function discoveredRepos(rootDir: string): { repos: string[]; pending: boolean } {
  const d = repoDiscovery.get(rootDir);
  if (!d) return { repos: ['.'], pending: false };
  return { repos: d.done ? d.repos : ['.'], pending: !d.done };
}
