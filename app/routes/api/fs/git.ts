import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);

async function getRepos(rootDir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('find . -maxdepth 3 -name node_modules -prune -o -name .git -type d -print', { cwd: rootDir });
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
    return ['.', 'examples'];
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rootDir = process.cwd();

  const repos = await getRepos(rootDir);
  let repo = url.searchParams.get('repo');
  if (!repo || !repos.includes(repo)) {
    repo = repos.includes('.') ? '.' : (repos[0] || '.');
  }

  const targetDir = repo === '.' ? rootDir : path.join(rootDir, repo);

  try {
    // Use --porcelain=v1 -uall so all individual edited/untracked files are listed
    const { stdout: statusOut } = await execAsync('git status --porcelain=v1 -uall', { cwd: targetDir });

    let branch = 'main';
    let branches: string[] = ['main'];
    try {
      const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: targetDir });
      branch = branchOut.trim() || 'main';

      const { stdout: allBranchesOut } = await execAsync('git branch --format="%(refname:short)"', { cwd: targetDir });
      branches = allBranchesOut.trim().split('\n').filter(Boolean);
      if (!branches.includes(branch)) {
        branches.unshift(branch);
      }
    } catch {
      // ignore branch resolution errors
    }

    const changes = statusOut
      .trim()
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

    return json({
      changes,
      branch: branch || 'main',
      branches: branches.length ? branches : ['main'],
      repos,
      activeRepo: repo,
      syncCount: 0,
    });
  } catch (error: any) {
    return json({
      changes: [],
      branch: 'main',
      branches: ['main'],
      repos: repos.length ? repos : ['.'],
      activeRepo: repo,
      syncCount: 0,
      error: error?.message || 'Git error',
    }, { status: 200 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const rootDir = process.cwd();
  const repo = (formData.get('repo') as string) || '.';
  const targetDir = repo === '.' ? rootDir : path.join(rootDir, repo);
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
      await execAsync(`git checkout "${branch}"`, { cwd: targetDir });
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
    }
    return json({ success: true });
  } catch (error: any) {
    console.error('Git action error:', error);
    return json({ success: false, error: error.message || 'Operation failed' }, { status: 400 });
  }
}
