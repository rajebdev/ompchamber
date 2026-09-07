import { json, type LoaderFunctionArgs } from '@remix-run/node';
import fs from 'fs';
import path from 'path';
import { isMockMode } from '@/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/lib/fs-root';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');

  if (!filePath) {
    return json({ error: 'Missing path' }, { status: 400 });
  }

  const baseDir = await resolveRoot(url.searchParams.get('root'), getDefaultFsRoot(isMockMode()));
  const cleanPath = filePath.replace(/^\/+/, '');
  const fullPath = path.resolve(baseDir, cleanPath);

  if (fullPath !== baseDir && !fullPath.startsWith(baseDir + path.sep)) {
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
