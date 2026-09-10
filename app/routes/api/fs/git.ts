import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import { resolveRoot } from '@/lib/fs/root';

const execAsync = util.promisify(exec);

const MAX_GIT_DEPTH = 8;

async function getRepos(rootDir: string): Promise<string[]> {
  try {
    // Search deep enough to discover nested/child git repos inside a monorepo
    // workspace (e.g. projects/<name>/<sub>/.git) while pruning node_modules.
    const { stdout } = await execAsync(
      `find . -maxdepth ${MAX_GIT_DEPTH} -name node_modules -prune -o -name .git -type d -print`,
      { cwd: rootDir, timeout: 12000, maxBuffer: 1024 * 1024 }
    );
    const discovered = stdout
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

  try {
    // Use --porcelain=v1 -uall so all individual edited/untracked files are listed
    const { stdout: statusOut } = await execAsync('git status --porcelain=v1 -uall', { cwd: targetDir });

    let branch = 'main';
    let branches: string[] = ['main'];
    let remoteBranches: string[] = [];
    try {
      const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: targetDir });
      branch = branchOut.trim() || 'main';

      const { stdout: localOut } = await execAsync('git branch --format="%(refname:short)"', { cwd: targetDir });
      branches = localOut.trim().split('\n').filter(Boolean);

      const { stdout: remoteOut } = await execAsync('git branch -r --format="%(refname:short)"', { cwd: targetDir });
      remoteBranches = remoteOut.trim().split('\n').filter(Boolean).filter(b => b.includes('/') && !b.endsWith('/HEAD'));
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

    // `git rev-list --left-right --count HEAD...@{upstream}` prints "<ahead>\t<behind>".
    let syncCount = { ahead: 0, behind: 0 };
    try {
      const { stdout: syncOut } = await execAsync(
        'git rev-list --left-right --count HEAD...@{upstream}',
        { cwd: targetDir, timeout: 8000 }
      );
      const [ahead, behind] = syncOut.trim().split(/\s+/).map(Number);
      syncCount = { ahead: ahead || 0, behind: behind || 0 };
    } catch {
      // No upstream configured — nothing to sync against.
    }

    return json({
      changes,
      branch: branch || 'main',
      branches: branches.length ? branches : ['main'],
      remoteBranches,
      repos,
      reposPending: pending,
      activeRepo: repo,
      syncCount,
    });
  } catch (error: any) {
    return json({
      changes: [],
      branch: 'main',
      branches: ['main'],
      remoteBranches: [],
      repos: repos.length ? repos : ['.'],
      reposPending: pending,
      activeRepo: repo,
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
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: targetDir });
    } else if (actionType === 'stage') {
      const file = formData.get('file') as string;
      await execAsync(`git add "${file}"`, { cwd: targetDir });
    } else if (actionType === 'stage_all') {
      await execAsync(`git add -A`, { cwd: targetDir });
    } else if (actionType === 'unstage') {
      const file = formData.get('file') as string;
      await execAsync(`git restore --staged "${file}"`, { cwd: targetDir });
    } else if (actionType === 'unstage_all') {
      await execAsync(`git restore --staged .`, { cwd: targetDir });
    } else if (actionType === 'revert') {
      const file = formData.get('file') as string;
      const fullPath = path.join(targetDir, file);
      try {
        const { stdout: checkOut } = await execAsync(`git status --porcelain -- "${file}"`, { cwd: targetDir });
        if (checkOut.trim().startsWith('??')) {
          if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
        } else {
          await execAsync(`git restore -- "${file}"`, { cwd: targetDir });
        }
      } catch {
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
    } else if (actionType === 'revert_all') {
      await execAsync(`git restore .`, { cwd: targetDir });
      await execAsync(`git clean -fd`, { cwd: targetDir });
    } else if (actionType === 'checkout') {
      const branch = formData.get('branch') as string;
      const isLocal = await execAsync(`git rev-parse --verify --quiet refs/heads/${branch}`, { cwd: targetDir })
        .then(() => true)
        .catch(() => false);
      if (isLocal) {
        await execAsync(`git checkout "${branch}"`, { cwd: targetDir });
      } else {
        const localName = branch.split('/').slice(1).join('/');
        const localExists = await execAsync(`git rev-parse --verify --quiet refs/heads/${localName}`, { cwd: targetDir })
          .then(() => true)
          .catch(() => false);
        if (localExists) {
          await execAsync(`git checkout "${localName}"`, { cwd: targetDir });
        } else {
          await execAsync(`git checkout -b "${localName}" --track "${branch}"`, { cwd: targetDir });
        }
      }
    } else if (actionType === 'create_branch') {
      const branch = formData.get('branch') as string;
      await execAsync(`git checkout -b "${branch}"`, { cwd: targetDir });
    } else if (actionType === 'history') {
      const { stdout } = await execAsync(
        `git log -n 50 --date-order --pretty=format:"|~|%h|~|%an|~|%ar|~|%s"`,
        { cwd: targetDir }
      );
      const parsedData = stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.split('|~|');
        return {
          graph: parts.length > 1 ? parts[0] : '',
          hash: parts.length > 2 ? parts[1] : '',
          author: parts.length > 3 ? parts[2] : '',
          time: parts.length > 4 ? parts[3] : '',
          message: parts.length > 4 ? parts[4] : parts[0] || '',
        };
      });
      return json({ success: true, type: 'history', data: parsedData });
    } else if (actionType === 'graph') {
      const { stdout } = await execAsync(
        `git log --graph --all --date-order --pretty=format:"|~|%h|~|%an|~|%ar|~|%s" -n 50`,
        { cwd: targetDir }
      );
      const parsedData = stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.split('|~|');
        return {
          graph: parts[0] || '',
          hash: parts[1] || '',
          author: parts[2] || '',
          time: parts[3] || '',
          message: parts[4] || '',
        };
      });
      return json({ success: true, type: 'graph', data: parsedData });
    } else if (actionType === 'push') {
      await execAsync('git push', { cwd: targetDir, timeout: 120000 });
    } else if (actionType === 'pull') {
      await execAsync('git pull --ff-only', { cwd: targetDir, timeout: 120000 });
    } else if (actionType === 'sync') {
      await execAsync('git pull --ff-only', { cwd: targetDir, timeout: 120000 });
      await execAsync('git push', { cwd: targetDir, timeout: 120000 });
    }
    return json({ success: true });
  } catch (error: any) {
    console.error('Git action error:', error);
    return json({ success: false, error: error.message || 'Operation failed' }, { status: 400 });
  }
}
