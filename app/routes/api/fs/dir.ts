import { json, type LoaderFunctionArgs } from '@remix-run/node';
import fs from 'fs';
import path from 'path';
import { isMockMode } from '@/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/lib/fs-root';

// Lazy listing: return only the immediate children of a directory. Folders are
// emitted with `children: null` meaning "not loaded yet" so the client can
// fetch them on demand — directories are NOT recursed here (keeps the initial
// payload tiny for deep workspaces).
function listEntries(dirPath: string, rootPath: string): any[] {
  const entries = fs.readdirSync(dirPath)
    .filter(child => !child.startsWith('.') && child !== 'node_modules' && child !== '.git' && child !== 'dist' && child !== 'build')
    .map(child => {
      const full = path.join(dirPath, child);
      try {
        const st = fs.statSync(full);
        const rel = path.relative(rootPath, full);
        if (st.isDirectory()) {
          return { id: rel, name: child, type: 'folder', path: rel, children: null, is_expanded: 0 };
        }
        return { id: rel, name: child, type: 'file', path: rel };
      } catch {
        return null; // unreadable entry / broken symlink — skip
      }
    })
    .filter((x): x is any => Boolean(x));

  entries.sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mock = isMockMode();
  const baseDir = await resolveRoot(url.searchParams.get('root'), getDefaultFsRoot(mock));

  const targetPath = url.searchParams.get('path') || '.';
  const fullPath = path.resolve(baseDir, targetPath);

  // Security check to prevent traversing outside the scoped root
  if (fullPath !== baseDir && !fullPath.startsWith(baseDir + path.sep)) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    const files = listEntries(fullPath, baseDir);
    return json({ files, isMock: mock, root: baseDir, path: targetPath });
  } catch (error) {
    console.error(error);
    return json({ error: 'Failed to read directory', isMock: mock }, { status: 500 });
  }
}
