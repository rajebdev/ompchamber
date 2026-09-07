import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';

export async function loader({ params }: LoaderFunctionArgs) {
  const db = await getDb();
  const sessionId = params.sessionId;
  
  const files = await db.all('SELECT * FROM files WHERE session_id = ? ORDER BY type DESC, name ASC', sessionId);
  
  // Convert flat list to tree
  const fileMap = new Map();
  files.forEach(f => fileMap.set(f.id, { ...f, children: [] }));
  
  const rootFiles: any[] = [];
  
  files.forEach(f => {
    if (f.parent_id === null) {
      rootFiles.push(fileMap.get(f.id));
    } else {
      const parent = fileMap.get(f.parent_id);
      if (parent) {
        parent.children.push(fileMap.get(f.id));
      }
    }
  });

  return json({ files: rootFiles });
}
