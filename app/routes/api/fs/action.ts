import { json, type ActionFunctionArgs } from '@remix-run/node';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const actionType = formData.get('actionType') as string;
  const filePath = formData.get('path') as string;
  
  const rootDir = path.join(process.cwd(), 'examples');
  const fullPath = path.join(rootDir, filePath);

  if (!fullPath.startsWith(rootDir)) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    if (actionType === 'save') {
      const content = (formData.get('content') as string) ?? '';
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      return json({ success: true });
    } else if (actionType === 'delete') {
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
      return json({ success: true });
    } else if (actionType === 'rename') {
      const newPath = formData.get('newPath') as string;
      const fullNewPath = path.join(rootDir, newPath);
      if (!fullNewPath.startsWith(rootDir)) {
        return json({ error: 'Invalid new path' }, { status: 403 });
      }
      fs.renameSync(fullPath, fullNewPath);
      return json({ success: true });
    } else if (actionType === 'open_explorer') {
      const dirToOpen = fs.statSync(fullPath).isDirectory() ? fullPath : path.dirname(fullPath);
      let command = '';
      if (process.platform === 'win32') {
        command = `start "" "${dirToOpen}"`;
      } else if (process.platform === 'darwin') {
        command = `open "${dirToOpen}"`;
      } else {
        command = `xdg-open "${dirToOpen}"`;
      }
      execAsync(command).catch(e => console.error('Failed to open explorer:', e));
      return json({ success: true });
    } else if (actionType === 'git_history') {
      const targetDir = rootDir; 
      try {
        const { stdout } = await execAsync(`git log -n 50 --date-order --pretty=format:"|~|%h|~|%an|~|%ar|~|%s" -- "${filePath}"`, { cwd: targetDir });
        const parsedData = stdout.split('\n').filter(Boolean).map(line => {
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
      } catch (err: any) {
        if (err.message?.includes('not a git repository')) {
           return json({ error: 'Not a git repository' }, { status: 200 });
        }
        throw err;
      }
    }
    
    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
