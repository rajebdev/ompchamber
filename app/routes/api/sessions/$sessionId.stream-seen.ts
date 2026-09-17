import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { markStreamSeen } from '@/lib/omp/session/stream-state.server';

/**
 * POST /api/sessions/:sessionId/stream-seen — acknowledge the session's
 * one-shot stream badge (`finish` / `abort` / `error`). Called when the
 * session is opened; deletes the terminal row so the check shows exactly
 * once. A `stream` row (live run) is never deleted — a client acking from a
 * stale status map must not kill the spinner of a running session.
 */
export async function action({ params }: ActionFunctionArgs) {
  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }
  const deleted = await markStreamSeen(sessionId);
  return json({ success: true, sessionId, deleted });
}
