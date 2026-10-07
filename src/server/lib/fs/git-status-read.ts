/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The git status read for one working tree: branch, branch lists, changed files
 * and (on request) the ahead/behind count.
 *
 * Extracted from `routes/fs/git.ts` so the HTTP route and the realtime `git:`
 * topic answer from ONE implementation. Two copies would drift on the details
 * that matter — which files count as staged, how a rename is unwrapped, how a
 * detached HEAD is named — and the panel would then show a different list
 * depending on which path delivered it.
 *
 * Read-only: the caller supplies a directory inside a root it has already
 * resolved.
 */

import { runShell } from '@/server/lib/fs/shell';
import { gitSyncCount, refreshRemoteRefs } from '@/server/lib/fs/git-sync';
import type { GitChange } from '@/shared/types';

export interface GitStatusPayload {
  changes: GitChange[];
  branch: string;
  branches: string[];
  remoteBranches: string[];
  syncCount?: { ahead: number; behind: number };
  error?: string;
}

export interface GitStatusOptions {
  /**
   * Fetch the remote's refs and report the ahead/behind count.
   *
   * Only the git panel asks for it: the status-only readers (the activity bar's
   * dot, the file explorer) must not trigger a network fetch, and must not pay
   * for a count they never read. TTL'd inside the helper, so a poll is not a
   * fetch loop.
   */
  sync?: boolean;
}

/**
 * Read one working tree's status.
 *
 * Never throws: a directory that is not a repository (or a host without `git`)
 * answers an empty change list with the error text, which is what the panel
 * renders — a thrown error would take the whole response down over a directory
 * the user merely pointed at.
 */
export async function readGitStatus(targetDir: string, options: GitStatusOptions = {}): Promise<GitStatusPayload> {
  const syncRequested = options.sync === true;
  try {
    // Started before the local probes below so the fetch overlaps them instead
    // of adding up.
    const remoteRefresh = syncRequested ? refreshRemoteRefs(targetDir) : Promise.resolve();

    // `--porcelain=v1 -uall` so all individual edited/untracked files are listed.
    const statusOut = (await runShell('git status --porcelain=v1 -uall', { cwd: targetDir, maxBuffer: 1024 * 1024 })).stdout;

    let branch = 'main';
    // Seeded empty, not `['main']`: the seed used to be pushed as a real local
    // branch, so a repository whose only branch is `main` listed it twice.
    const branches: string[] = [];
    const remoteBranches: string[] = [];
    try {
      // One `for-each-ref` answers all three questions the three previous
      // spawns asked separately (`rev-parse --abbrev-ref HEAD`, `branch`,
      // `branch -r`): `%(HEAD)` marks the checked-out branch with `*`, and the
      // two refspecs cover local and remote in one listing. Measured 8.15 ms
      // against 19.63 ms for the three-call form.
      //
      // Classification reads the FULL refname: `%(refname:short)` maps
      // `refs/remotes/origin/HEAD` to the bare `origin`, which has no slash and
      // would otherwise be listed as a local branch.
      const refsOut = (await runShell(
        'git for-each-ref --format="%(refname)%09%(refname:short)%09%(HEAD)" refs/heads refs/remotes',
        { cwd: targetDir },
      )).stdout;
      let sawHead = false;
      for (const line of refsOut.split('\n')) {
        const [full, short, head] = line.split('\t');
        if (!full || !short) continue;
        // `refs/remotes/origin/HEAD` is a symbolic alias, not a branch.
        if (full.endsWith('/HEAD')) continue;
        if (full.startsWith('refs/remotes/')) {
          remoteBranches.push(short);
          continue;
        }
        branches.push(short);
        if (head === '*') {
          branch = short;
          sawHead = true;
        }
      }
      // Detached HEAD: no local ref is marked, and the branch is the sha
      // `rev-parse --abbrev-ref HEAD` prints. Ask for it rather than reporting
      // a branch the checkout is not on.
      if (!sawHead) {
        const headOut = await runShell('git rev-parse --abbrev-ref HEAD', { cwd: targetDir });
        branch = headOut.stdout.trim() || 'main';
      }
    } catch {
      // ignore branch resolution errors
    }
    // `main` remains the answer only when nothing could be read (a non-repo
    // directory, git missing) — a real listing always supplies its own refs.
    if (branches.length === 0) branches.push('main');
    else if (!branches.includes(branch)) branches.unshift(branch);

    const changes: GitChange[] = statusOut
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const status = line.slice(0, 2);
        let file = line.slice(2).trim();

        if (file.startsWith('"') && file.endsWith('"')) {
          try {
            file = JSON.parse(file);
          } catch {}
        }
        if (file.includes(' -> ')) {
          file = file.split(' -> ')[1].trim();
        }

        const isStaged = status[0] !== ' ' && status[0] !== '?';

        return { status, file, staged: isStaged, additions: 1, deletions: 0 };
      });

    await remoteRefresh;
    const syncCount = syncRequested ? await gitSyncCount(targetDir) : undefined;

    return { changes, branch: branch || 'main', branches: branches.length ? branches : ['main'], remoteBranches, syncCount };
  } catch (error) {
    return {
      changes: [],
      branch: 'main',
      branches: ['main'],
      remoteBranches: [],
      syncCount: { ahead: 0, behind: 0 },
      error: error instanceof Error ? error.message : 'Git error',
    };
  }
}
