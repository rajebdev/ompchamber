import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { resolveSessionFileOr404 } from '@/server/lib/omp/session/locator';
import { readSessionStats } from '@/server/lib/omp/session/stats';

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
  const resolved = await resolveSessionFileOr404(sessionId);
  if ('response' in resolved) return resolved.response;
  const { filePath } = resolved;
  const stats = readSessionStats(filePath);
  if (!stats) {
    return json({ error: 'Session could not be parsed' }, { status: 500 });
  }
  return json({ stats, isMock: false });
}
