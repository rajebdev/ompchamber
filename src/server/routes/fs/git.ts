import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import fs from 'fs';
import path from 'path';
import { resolveRoot } from '@/server/lib/fs/root';
import { runShell } from '@/server/lib/fs/shell';
import { fetchFileDiff, fetchGitCommits } from '@/server/lib/fs/git-log';
import { fetchWorkingFileDiff } from '@/server/lib/fs/git-diff';
import { gitSyncCount, invalidateRemoteRefs, markRemoteRefsFresh, refreshRemoteRefs } from '@/server/lib/fs/git-sync';

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

// Nested-repo discovery is expensive (find over a deep workspace), so it runs
// in the background after the loader returns the root status. Results are
// cached per scoped root and the client polls `?reposOnly=1` until ready.
interface RepoDiscovery {
  repos: string[];
  done: boolean;
}
const repoDiscovery = new Map<string, RepoDiscovery>();

function startRepoScan(rootDir: string): void {
  if (repoDiscovery.has(rootDir)) return;
  const d: RepoDiscovery = { repos: ['.'], done: false };
  repoDiscovery.set(rootDir, d);
  void getRepos(rootDir)
    .then(repos => { d.repos = repos; d.done = true; })
    .catch(() => { d.repos = ['.']; d.done = true; });
}

function discoveredRepos(rootDir: string): { repos: string[]; pending: boolean } {
  const d = repoDiscovery.get(rootDir);
  if (!d) return { repos: ['.'], pending: false };
  return { repos: d.done ? d.repos : ['.'], pending: !d.done };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rootDir = await resolveRoot(url.searchParams.get('root'), process.cwd());

  // Kick off nested-repo discovery in the background (non-blocking) and read
  // whatever is already cached. `rescan=1` invalidates the cache so a fresh
  // discovery pass starts (used by the repo-switcher refresh button).
  const rescan = url.searchParams.get('rescan') === '1';
  if (rescan) {
    repoDiscovery.delete(rootDir);
  }
  startRepoScan(rootDir);
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
      const diffData = await fetchWorkingFileDiff(targetDir, targetFile, staged, statusParam);
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
    let branches: string[] = ['main'];
    let remoteBranches: string[] = [];
    try {
      const branchOut = await runShell('git rev-parse --abbrev-ref HEAD', { cwd: targetDir });
      branch = branchOut.stdout.trim() || 'main';

      const localOut = await runShell('git branch --format="%(refname:short)"', { cwd: targetDir });
      branches = localOut.stdout.trim().split('\n').filter(Boolean);

      const remoteOut = await runShell('git branch -r --format="%(refname:short)"', { cwd: targetDir });
      remoteBranches = remoteOut.stdout.trim().split('\n').filter(Boolean).filter(b => b.includes('/') && !b.endsWith('/HEAD'));
      if (!branches.includes(branch)) {
        branches.unshift(branch);
      }
    } catch {
      // ignore branch resolution errors
    }

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
