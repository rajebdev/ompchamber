import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';

export async function loader({ params }: LoaderFunctionArgs) {
  const db = await getDb();
  const folderId = params.folderId;
  const sessions = await db.all('SELECT * FROM sessions WHERE folder_id = ? ORDER BY RANDOM()', folderId);
  return json({ sessions });
}
