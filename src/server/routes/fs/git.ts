/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `GET /api/fs/git` — the Source Control panel's data, and the file-diff /
 * commit-history endpoints the diff panel and commit modal read.
 *
 * Repository discovery (`?reposOnly=1`) is a background walk over the scoped
 * root; see `lib/fs/git-repos.ts`. This module owns the request shapes.
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import fs from 'fs';
import path from 'path';
import { resolveRoot } from '@/server/lib/fs/root';
import { runShell } from '@/server/lib/fs/shell';
import { discoveredRepos, rescanRepos, startRepoScan } from '@/server/lib/fs/git-repos';
import { fetchFileDiff, fetchGitCommits } from '@/server/lib/fs/git-log';
import { fetchWorkingFileDiff } from '@/server/lib/fs/git-diff';
import { gitSyncCount, invalidateRemoteRefs, markRemoteRefsFresh, refreshRemoteRefs } from '@/server/lib/fs/git-sync';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rootDir = await resolveRoot(url.searchParams.get('root'), process.cwd());

  // Kick off nested-repo discovery in the background (non-blocking) and read
  // whatever is already cached. `rescan=1` invalidates the cache so a fresh
  // discovery pass starts (used by the repo-switcher refresh button).
  const rescan = url.searchParams.get('rescan') === '1';
  if (rescan) rescanRepos(rootDir);
  else startRepoScan(rootDir);
  const { repos, pending } = discoveredRepos(rootDir);

  // Lightweight polling endpoint: just the discovered repos, no git status.
  if (url.searchParams.get('reposOnly') === '1') {
    return json({ repos, reposPending: pending, activeRepo: (url.searchParams.get('repo') || '.') });
  }

  // An explicitly requested repo is honored even while a rescan is pending
  // (path containment is enforced below), so refreshing the list doesn't yank
  // the user back to the root repo mid-scan.
  let repo = url.searchParams.get('repo') || '';
  if (!repo) {
    repo = repos.includes('.') ? '.' : (repos[0] || '.');
  }

  const targetDir = repo === '.' ? rootDir : path.join(rootDir, repo);
  if (targetDir !== rootDir && !targetDir.startsWith(rootDir + path.sep)) {
    return json({ error: 'Invalid repo path' }, { status: 403 });
  }

  // File diff endpoint
  if (url.searchParams.get('fileDiff') === '1' || url.searchParams.get('diff') === '1') {
    const targetFile = url.searchParams.get('file');
    if (targetFile) {
      const staged = url.searchParams.get('staged') === '1' || url.searchParams.get('staged') === 'true';
      const statusParam = url.searchParams.get('status') || undefined;
      const fullContext = url.searchParams.get('fullContext') === '1';
      const diffData = await fetchWorkingFileDiff(targetDir, targetFile, staged, statusParam, fullContext);
      return json({ success: true, ...diffData });
    }
  }

  // Commits history / graph endpoint
  if (url.searchParams.get('commits') === '1' || url.searchParams.get('history') === '1' || url.searchParams.get('graph') === '1') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = parseInt(url.searchParams.get('skip') || '0', 10);
    const result = await fetchGitCommits(targetDir, limit, skip);
    return json({
      success: true,
      data: result.commits,
      hasMore: result.hasMore,
      total: result.total,
      limit,
      skip,
    });
  }

  // Ahead/behind are only requested by the git panel (`?sync=1`); the
  // status-only polls (activity bar, file explorer) must not trigger a network
  // fetch, and must not pay for a count they never read.
  const syncRequested = url.searchParams.get('sync') === '1';

  try {
    // Started before the local probes below so the fetch overlaps them instead
    // of adding up; TTL'd inside the helper, so the panel's 5s poll is not a 5s
    // fetch loop.
    const remoteRefresh = syncRequested ? refreshRemoteRefs(targetDir) : Promise.resolve();

    // Use --porcelain=v1 -uall so all individual edited/untracked files are listed
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
      // against 19.63 ms for the three-call form, on a 5s poll.
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

    const changes = statusOut
      .split('\n')
      .filter(Boolean)
      .map(line => {
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

        return {
          status,
          file,
          staged: isStaged,
          additions: 1,
          deletions: 0,
        };
      });

    await remoteRefresh;
    const syncCount = syncRequested ? await gitSyncCount(targetDir) : undefined;

    // No `repos`/`reposPending`/`activeRepo` here: the repo list travels on the
    // `?reposOnly=1` branch, keyed to the root it was discovered for. Echoing a
    // repo back in a status response is what let a panel adopt a repo it had
    // never chosen — and adopt it under whichever workspace was active when the
    // echo arrived.
    return json({
      changes,
      branch: branch || 'main',
      branches: branches.length ? branches : ['main'],
      remoteBranches,
      syncCount,
    });
  } catch (error: any) {
    return json({
      changes: [],
      branch: 'main',
      branches: ['main'],
      remoteBranches: [],
      syncCount: { ahead: 0, behind: 0 },
      error: error?.message || 'Git error',
    }, { status: 200 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const rootDir = await resolveRoot(formData.get('root') as string, process.cwd());
  const repo = (formData.get('repo') as string) || '.';
  const targetDir = repo === '.' ? rootDir : path.join(rootDir, repo);
  if (targetDir !== rootDir && !targetDir.startsWith(rootDir + path.sep)) {
    return json({ error: 'Invalid repo path' }, { status: 403 });
  }
  const actionType = formData.get('actionType') as string;

  try {
    if (actionType === 'commit') {
      const message = formData.get('message') as string;
      await expectOk(`git commit -m "${message.replace(/"/g, '\\"')}"`, targetDir);
    } else if (actionType === 'stage') {
      const file = formData.get('file') as string;
      await expectOk(`git add "${file}"`, targetDir);
    } else if (actionType === 'stage_all') {
      await expectOk('git add -A', targetDir);
    } else if (actionType === 'unstage') {
      const file = formData.get('file') as string;
      await expectOk(`git restore --staged "${file}"`, targetDir);
    } else if (actionType === 'unstage_all') {
      await expectOk('git restore --staged .', targetDir);
    } else if (actionType === 'revert') {
      const file = formData.get('file') as string;
      const fullPath = path.join(targetDir, file);
      const removeIfPresent = async () => {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
      };
      try {
        const checkOut = await runShell(`git status --porcelain -- "${file}"`, { cwd: targetDir });
        if (checkOut.stdout.trim().startsWith('??')) {
          await removeIfPresent();
        } else {
          await expectOk(`git restore -- "${file}"`, targetDir);
        }
      } catch {
        await removeIfPresent();
      }
    } else if (actionType === 'revert_all') {
      await expectOk('git restore .', targetDir);
      await expectOk('git clean -fd', targetDir);
    } else if (actionType === 'checkout') {
      const branch = formData.get('branch') as string;
      const isLocal = await refExists(`refs/heads/${branch}`, targetDir);
      if (isLocal) {
        await expectOk(`git checkout "${branch}"`, targetDir);
      } else {
        const localName = branch.split('/').slice(1).join('/');
        const localExists = await refExists(`refs/heads/${localName}`, targetDir);
        if (localExists) {
          await expectOk(`git checkout "${localName}"`, targetDir);
        } else {
          await expectOk(`git checkout -b "${localName}" --track "${branch}"`, targetDir);
        }
      }
      // The counts are per-branch: the refs the previous branch refreshed say
      // nothing about the new one's upstream.
      invalidateRemoteRefs(targetDir);
    } else if (actionType === 'create_branch') {
      const branch = formData.get('branch') as string;
      await expectOk(`git checkout -b "${branch}"`, targetDir);
      invalidateRemoteRefs(targetDir);
    } else if (actionType === 'history' || actionType === 'graph') {
      const limit = parseInt((formData.get('limit') as string) || '50', 10);
      const skip = parseInt((formData.get('skip') as string) || '0', 10);
      const result = await fetchGitCommits(targetDir, limit, skip);
      return json({
        success: true,
        type: actionType,
        data: result.commits,
        hasMore: result.hasMore,
        total: result.total,
        limit,
        skip,
      });
    } else if (actionType === 'commit_diff') {
      const hash = (formData.get('hash') as string) || '';
      const file = (formData.get('file') as string) || '';
      const diff = await fetchFileDiff(targetDir, hash, file);
      return json({ success: true, diff });
    } else if (actionType === 'file_diff') {
      const file = (formData.get('file') as string) || '';
      const staged = formData.get('staged') === '1' || formData.get('staged') === 'true';
      const diffData = await fetchWorkingFileDiff(targetDir, file, staged);
      return json({ success: true, ...diffData });
    } else if (actionType === 'cherry_pick') {
      const hash = formData.get('hash') as string;
      await expectOk(`git cherry-pick "${hash}"`, targetDir);
    } else if (actionType === 'revert_commit') {
      const hash = formData.get('hash') as string;
      await expectOk(`git revert --no-edit "${hash}"`, targetDir);
    } else if (actionType === 'reset_commit') {
      const hash = formData.get('hash') as string;
      const mode = (formData.get('mode') as string) || 'soft';
      await expectOk(`git reset --${mode} "${hash}"`, targetDir);
    } else if (actionType === 'merge_commit') {
      const hash = formData.get('hash') as string;
      await expectOk(`git merge "${hash}"`, targetDir);
    } else if (actionType === 'rebase_commit') {
      const hash = formData.get('hash') as string;
      await expectOk(`git rebase "${hash}"`, targetDir);
    } else if (actionType === 'push') {
      await expectOk('git push', targetDir, 120000);
      markRemoteRefsFresh(targetDir);
    } else if (actionType === 'pull') {
      await expectOk('git pull --ff-only', targetDir, 120000);
      markRemoteRefsFresh(targetDir);
    } else if (actionType === 'sync') {
      await expectOk('git pull --ff-only', targetDir, 120000);
      await expectOk('git push', targetDir, 120000);
      // Both commands already moved the tracking ref; the next poll must not
      // fetch again to see a state it just produced.
      markRemoteRefsFresh(targetDir);
    }
    return json({ success: true });
  } catch (error: any) {
    console.error('Git action error:', error);
    return json({ success: false, error: error.message || 'Operation failed' }, { status: 400 });
  }
}

/** Runs a git command and throws with its stderr when it exits non-zero. */
async function expectOk(command: string, cwd: string, timeout?: number): Promise<void> {
  const result = await runShell(command, { cwd, timeout, maxBuffer: 1024 * 1024 });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git exited with code ${result.exitCode}`);
  }
}

/** True when the ref resolves; `--quiet` keeps stderr clean on a miss. */
async function refExists(ref: string, cwd: string): Promise<boolean> {
  const result = await runShell(`git rev-parse --verify --quiet ${ref}`, { cwd });
  return result.exitCode === 0;
}
