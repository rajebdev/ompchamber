import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { isMockMode } from '@/mock.server';
import { findSessionFileById } from '@/lib/omp/session/locator';
import { readSessionStats } from '@/lib/omp/session/stats';

/**
 * GET /api/omp/session-stats?sessionId=<uuid> — per-session enrichment for
 * the browser: model history, thinking levels, compaction count, and token/
 * cost rollups parsed from the session jsonl. Read-only.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const mock = isMockMode();
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  if (mock) {
    return json({ stats: null, isMock: true });
  }
  if (!sessionId) {
    return json({ error: 'sessionId is required' }, { status: 400 });
  }
  const filePath = findSessionFileById(sessionId);
  if (!filePath) {
    return json({ error: 'Session not found' }, { status: 404 });
  }
  const stats = readSessionStats(filePath);
  if (!stats) {
    return json({ error: 'Session could not be parsed' }, { status: 500 });
  }
  return json({ stats, isMock: false });
}
