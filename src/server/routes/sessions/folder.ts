import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { getDb } from '@/server/db.server';

/**
 * GET /api/sessions/:sessionId — the sessions belonging to one workspace
 * folder. The path segment carries a folder id; it is named `sessionId`
 * because Elysia requires one parameter name per position across every
 * `/api/sessions/*` route.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const db = await getDb();
  const folderId = params.sessionId;
  const sessions = await db.all('SELECT * FROM sessions WHERE folder_id = ? ORDER BY RANDOM()', [folderId]);
  return json({ sessions });
}
