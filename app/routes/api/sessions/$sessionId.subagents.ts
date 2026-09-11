import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { isMockMode } from '@/mock.server';
import { findSessionFileById } from '@/lib/omp/session/locator';
import { extractSubagentHistory } from '@/lib/omp/subagent/history';

/**
 * GET /api/sessions/:sessionId/subagents — on-disk subagent roster recovered
 * from the parent session file's task toolResults. Works without a live RPC
 * process (old sessions recover after a reload); an unknown session or one
 * without task calls yields an empty list, never a 404.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }

  // In mock mode, return predefined sample subagents
  if (isMockMode()) {
    const { getMockSubagents } = await import('@/data/mock/subagents');
    return json({ subagents: getMockSubagents(sessionId) });
  }

  try {
    const sessionFile = findSessionFileById(sessionId);
    if (!sessionFile) return json({ subagents: [] });
    return json({ subagents: extractSubagentHistory(sessionFile) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
