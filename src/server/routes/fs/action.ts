import { json, type ActionFunctionArgs } from '@/server/lib/remix-compat';
import fs from 'fs';
import path from 'path';
import { isMockMode } from '@/server/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/server/lib/fs/root';
import { runShell } from '@/server/lib/fs/shell';
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const actionType = formData.get('actionType') as string;
  const filePath = formData.get('path') as string;

  const rootDir = await resolveRoot(formData.get('root') as string, await getDefaultFsRoot(isMockMode()));
  const repo = (formData.get('repo') as string) || '.';
  const scopedRoot = repo === '.' ? rootDir : path.join(rootDir, repo);
  if (scopedRoot !== rootDir && !scopedRoot.startsWith(rootDir + path.sep)) {
    return json({ error: 'Invalid repo path' }, { status: 403 });
  }
  const fullPath = path.resolve(scopedRoot, filePath);

  if (fullPath !== scopedRoot && !fullPath.startsWith(scopedRoot + path.sep)) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    if (actionType === 'save') {
      const content = (formData.get('content') as string) ?? '';
      await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
      await Bun.write(fullPath, content);
      return json({ success: true });
    } else if (actionType === 'delete') {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
      return json({ success: true });
    } else if (actionType === 'rename') {
      const newPath = formData.get('newPath') as string;
      const fullNewPath = path.resolve(rootDir, newPath);
      if (fullNewPath !== rootDir && !fullNewPath.startsWith(rootDir + path.sep)) {
        return json({ error: 'Invalid new path' }, { status: 403 });
      }
      await fs.promises.rename(fullPath, fullNewPath);
      return json({ success: true });
    } else if (actionType === 'open_explorer') {
      const isDir = (await Bun.file(fullPath).stat().catch(() => null))?.isDirectory() ?? false;
      const dirToOpen = isDir ? fullPath : path.dirname(fullPath);
      let command = '';
      if (process.platform === 'win32') {
        command = `start "" "${dirToOpen}"`;
      } else if (process.platform === 'darwin') {
        command = `open "${dirToOpen}"`;
      } else {
        command = `xdg-open "${dirToOpen}"`;
      }
      runShell(command, { timeout: 5000 }).catch(e => console.error('Failed to open explorer:', e));
      return json({ success: true });
    } else if (actionType === 'git_history') {
      const targetDir = scopedRoot;
      const history = await runShell(
        `git log -n 50 --date-order --pretty=format:"|~|%h|~|%an|~|%ar|~|%s" -- "${filePath}"`,
        { cwd: targetDir, maxBuffer: 1024 * 1024 }
      );
      if (history.exitCode !== 0 && history.stderr.includes('not a git repository')) {
        return json({ error: 'Not a git repository' }, { status: 200 });
      }
      const parsedData = history.stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.split('|~|');
        if (parts.length === 1) {
          return { graph: '', message: parts[0] };
        }
        return {
          graph: parts[0],
          hash: parts[1],
          author: parts[2],
          time: parts[3],
          message: parts[4]
        };
      });
      return json({ success: true, type: 'history', data: parsedData });
    }
    
    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
