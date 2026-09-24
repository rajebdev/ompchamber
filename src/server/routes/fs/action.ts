import { json, type ActionFunctionArgs } from '@/server/lib/remix-compat';
import { errorResponse } from '@/server/lib/route-adapter';
import fs from 'fs';
import path from 'path';
import { isMockMode } from '@/server/mock.server';
import { getDefaultFsRoot, resolveRoot, resolveWithinRoot } from '@/server/lib/fs/root';
import { runShell } from '@/server/lib/fs/shell';
import { toDiskText } from '@/shared/lib/code/line-endings';
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const actionType = formData.get('actionType') as string;
  const filePath = formData.get('path') as string;

  const rootDir = await resolveRoot(formData.get('root') as string, await getDefaultFsRoot(isMockMode()));
  const repo = (formData.get('repo') as string) || '.';
  const scopedRoot = repo === '.' ? rootDir : resolveWithinRoot(rootDir, repo);
  if (!scopedRoot) {
    return json({ error: 'Invalid repo path' }, { status: 403 });
  }
  const fullPath = resolveWithinRoot(scopedRoot, filePath);

  if (!fullPath) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    if (actionType === 'save') {
      const raw = (formData.get('content') as string) ?? '';
      const eol = formData.get('eol');
      // The bytes are built here rather than written verbatim: `multipart/
      // form-data` normalizes every bare LF in a field value to CRLF in transit
      // (the HTML serializer does it on the way out, Bun's parser agrees on the
      // way in — same result either way), so an LF file would land on disk as
      // CRLF and show up as a full-file diff. `eol` is the ending the client
      // read the file with; without it the payload is written untouched.
      const content = eol === 'crlf' || eol === 'lf' ? toDiskText(raw, eol) : raw;
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
  } catch (error) {
    return errorResponse(error);
  }
}
