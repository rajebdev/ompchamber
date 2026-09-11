import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { isMockMode } from '@/mock.server';
import { findSessionFileById } from '@/lib/omp/session/locator';
import {
  SUBAGENT_ID_MAX_LENGTH,
  SUBAGENT_ID_RE,
  extractSubagentHistory,
} from '@/lib/omp/subagent/history';
import { readSubagentTranscriptPage } from '@/lib/omp/subagent/history-transcript';

/**
 * GET /api/sessions/:sessionId/subagents/:subagentId?fromByte=N — paged
 * transcript of one on-disk subagent, read from the parent session's sibling
 * artifacts dir (`<session-dir>/<subagentId>.jsonl`). `{ page: null }` when
 * the agent has no transcript on disk (still running, older session, or the
 * subagent id is unknown).
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { sessionId, subagentId } = params;
  if (!sessionId || !subagentId) {
    return json({ error: 'Missing session id or subagent id' }, { status: 400 });
  }
  // Bounds the value before it reaches the filesystem (the lib re-checks).
  if (!SUBAGENT_ID_RE.test(subagentId) || subagentId.length > SUBAGENT_ID_MAX_LENGTH) {
    return json({ error: 'Invalid subagent id', code: 'invalid_subagent_id' }, { status: 400 });
  }

  if (isMockMode()) {
    return json({ page: null });
  }

  try {
    const sessionFile = findSessionFileById(sessionId);
    if (!sessionFile) return json({ page: null });

    // One history pass locates the entry (and proves a sibling transcript was
    // recorded); the page reader re-derives the confined child path.
    const entry = extractSubagentHistory(sessionFile).find((candidate) => candidate.id === subagentId);
    if (!entry?.transcriptAvailable || !entry.sessionFile) return json({ page: null });

    const fromByteRaw = new URL(request.url).searchParams.get('fromByte');
    const parsed = fromByteRaw !== null ? Number(fromByteRaw) : 0;
    const fromByte = Number.isFinite(parsed) ? parsed : 0;

    return json({ page: readSubagentTranscriptPage(sessionFile, subagentId, fromByte) });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
