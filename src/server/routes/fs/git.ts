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
import { COMMIT_PAGE_SIZE } from '@/shared/lib/fs/commit-page';
import { resolveRoot } from '@/server/lib/fs/root';
import { discoveredRepos, rescanRepos, startRepoScan } from '@/server/lib/fs/git-repos';
import { fetchFileDiff, fetchGitCommits } from '@/server/lib/fs/git-log';
import { fetchWorkingFileDiff } from '@/server/lib/fs/git-diff';
import { invalidateRemoteRefs, markRemoteRefsFresh } from '@/server/lib/fs/git-sync';
import { runShell } from '@/server/lib/fs/shell';
import { readGitStatus } from '@/server/lib/fs/git-status-read';

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
    const limit = parseInt(url.searchParams.get('limit') || String(COMMIT_PAGE_SIZE), 10);
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
  //
  // The read itself lives in `lib/fs/git-status-read.ts`, so the realtime `git:`
  // topic and this route answer from one implementation.
  const status = await readGitStatus(targetDir, { sync: url.searchParams.get('sync') === '1' });

  // No `repos`/`reposPending`/`activeRepo` here: the repo list travels on the
  // `?reposOnly=1` branch, keyed to the root it was discovered for. Echoing a
  // repo back in a status response is what let a panel adopt a repo it had
  // never chosen — and adopt it under whichever workspace was active when the
  // echo arrived.
  return json(status);
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
      const limit = parseInt((formData.get('limit') as string) || String(COMMIT_PAGE_SIZE), 10);
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
