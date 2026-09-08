import { json, type ActionFunctionArgs } from '@remix-run/node';
import { execFile } from 'child_process';
import util from 'util';
import path from 'path';
import { isMockMode } from '@/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/lib/fs-root';
import { scopeToRepo } from '@/lib/repo-scope';

const execFileAsync = util.promisify(execFile);

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const q = formData.get('q') as string;
  const matchCase = formData.get('matchCase') === 'true';
  const wholeWord = formData.get('wholeWord') === 'true';
  const useRegex = formData.get('useRegex') === 'true';
  const includeFiles = formData.get('includeFiles') as string;

  if (!q) {
    return json({ results: [] });
  }

  try {
    const baseDir = await resolveRoot(formData.get('root') as string, getDefaultFsRoot(isMockMode()));
    const targetDir = scopeToRepo(baseDir, formData.get('repo') as string);
    
    const args = ['-rn'];
    if (!matchCase) args[0] += 'i';
    if (wholeWord) args[0] += 'w';
    if (useRegex) args[0] += 'E';
    else args[0] += 'F';

    args.push('--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist');
    
    if (includeFiles) {
      const patterns = includeFiles.split(',').map(p => p.trim()).filter(Boolean);
      patterns.forEach(p => {
        args.push(`--include=${p}`);
      });
    }

    args.push(q, '.');

    const { stdout } = await execFileAsync('grep', args, { cwd: targetDir }).catch((e: any) => {
      // grep returns exit code 1 if no lines were selected
      if (e.code === 1) return { stdout: '' };
      throw e;
    });
    
    if (!stdout.trim()) {
      return json({ results: [] });
    }

    const lines = stdout.trim().split('\n');
    const results = lines.map(line => {
      // line format: ./path/to/file:line:content
      const firstColon = line.indexOf(':');
      const secondColon = line.indexOf(':', firstColon + 1);
      
      if (firstColon === -1 || secondColon === -1) return null;

      const file = line.substring(0, firstColon).replace(/^\.\//, '');
      const lineNumber = line.substring(firstColon + 1, secondColon);
      const content = line.substring(secondColon + 1);

      return { file, line: lineNumber, content };
    }).filter(Boolean);

    return json({ results });
  } catch (error: any) {
    console.error(error);
    return json({ error: String(error) + ' cwd: ' + process.cwd() }, { status: 500 });
  }
}
