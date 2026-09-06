import { json, type LoaderFunctionArgs } from '@remix-run/node';
import fs from 'fs';
import path from 'path';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');
  
  if (!filePath) {
    return json({ error: 'Missing path' }, { status: 400 });
  }

  const workspaceRoot = process.cwd();
  const examplesDir = path.join(workspaceRoot, 'examples');
  const cleanPath = filePath.replace(/^\/+/, '');

  let fullPath = path.resolve(examplesDir, cleanPath.replace(/^examples\//, ''));
  if (!fs.existsSync(fullPath)) {
    const candidateInRoot = path.resolve(workspaceRoot, cleanPath);
    if (candidateInRoot.startsWith(workspaceRoot) && fs.existsSync(candidateInRoot)) {
      fullPath = candidateInRoot;
    }
  }

  if (!fullPath.startsWith(workspaceRoot)) {
    return json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    if (!fs.existsSync(fullPath)) {
      return json({ error: 'File not found' }, { status: 404 });
    }
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return json({ error: 'Cannot read a directory' }, { status: 400 });
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    return json({ content });
  } catch (error: any) {
    console.error(error);
    return json({ error: error.message }, { status: 500 });
  }
}
