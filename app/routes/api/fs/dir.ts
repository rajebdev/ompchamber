import { json, type LoaderFunctionArgs } from '@remix-run/node';
import fs from 'fs';
import path from 'path';

function buildTree(dirPath: string, rootPath: string): any {
  const stats = fs.statSync(dirPath);
  const name = path.basename(dirPath);
  const relPath = path.relative(rootPath, dirPath);

  if (stats.isDirectory()) {
    const children = fs.readdirSync(dirPath)
      .filter(child => !child.startsWith('.') && child !== 'node_modules') // simple ignore
      .map(child => buildTree(path.join(dirPath, child), rootPath));
    
    // Sort directories first, then files
    children.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      id: relPath || 'root',
      name: name || 'root',
      type: 'folder',
      path: relPath,
      children,
      is_expanded: relPath === '' ? 1 : 0
    };
  }

  return {
    id: relPath,
    name,
    type: 'file',
    path: relPath,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const rootDir = path.join(process.cwd(), 'examples');
  const targetPath = url.searchParams.get('path') || rootDir;
  const fullPath = path.resolve(rootDir, targetPath);

  // Security check to prevent traversing outside the project
  if (!fullPath.startsWith(rootDir)) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    const tree = buildTree(fullPath, rootDir);
    // If we request root, tree is the root folder. FileExplorer usually expects a list of files/folders
    const files = tree.children || [];
    return json({ files });
  } catch (error) {
    console.error(error);
    return json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
