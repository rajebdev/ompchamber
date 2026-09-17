import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { markStreamSeen } from '@/lib/omp/session/stream-state.server';

/**
 * POST /api/sessions/:sessionId/stream-seen — acknowledge the session's
 * one-shot stream badge (`finish` / `abort` / `error`). Called when the
 * session is opened; deletes the row so the check shows exactly once.
 */
export async function action({ params }: ActionFunctionArgs) {
  const sessionId = params.sessionId;
  if (!sessionId) {
    return json({ error: 'Missing session id' }, { status: 400 });
  }
  await markStreamSeen(sessionId);
  return json({ success: true, sessionId });
}
