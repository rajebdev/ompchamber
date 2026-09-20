import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { resolveSessionPathOr404 } from '@/server/lib/omp/session/locator';
import { WebRpcError, getRpcSession, resolveSpawnCwd, startRpcSession } from '@/server/lib/omp/rpc/manager';
import { getSpawnApprovalMode, reconcileSpawnApprovalMode } from '@/server/lib/omp/rpc/session-registry';
import { isApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { loadPersistedAccessMode } from '@/shared/lib/omp/config/access-mode.server';
import { rpcErrorResponse } from '@/server/lib/omp/rpc/errors';

// POST /api/agent/:sessionId — send a command to an existing session (or spawn
// it lazily). Mirrors omp-web's /api/agent/[id].
export async function sendCommand({ params, request }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.type !== 'string' || !body.type.trim()) {
      return json({ error: 'command type is required', code: 'command_type_required' }, { status: 400 });
    }

    // A request with no explicit mode must never change a live session: use the
    // wrapper's spawned mode as ground truth. Falling back to the persisted
    // setting here would let an in-flight settings write clobber the mode the
    // client just spawned with (sendNewPrompt posts its follow-up prompt
    // without repeating accessMode). Only a real spawn uses the persisted
    // default. omp has no RPC to change the mode after spawn.
    const explicitMode = isApprovalMode(body.accessMode) ? body.accessMode : null;

    // Fast path: already-running session.
    const existing = getRpcSession(sessionId);
    if (existing?.isAlive()) {
      // A mid-conversation change is honoured by destroying the idle process so
      // the spawn path below restarts it with the new --approval-mode flag.
      const liveMode = explicitMode ?? getSpawnApprovalMode(existing);
      if (!(await reconcileSpawnApprovalMode(existing, liveMode))) {
        const result = await existing.send(body);
        return json({ success: true, data: result });
      }
    }

    const resolved = await resolveSessionPathOr404(sessionId);
    if ('response' in resolved) return resolved.response;
    const { filePath, recordedCwd } = resolved;

    const cwd = await resolveSpawnCwd(recordedCwd);
    const spawnMode = explicitMode ?? await loadPersistedAccessMode();
    const { session } = await startRpcSession(sessionId, filePath, cwd, recordedCwd, spawnMode);
    const result = await session.send(body);
    return json({ success: true, data: result });
  } catch (error) {
    return rpcErrorResponse(error);
  }
}

// GET /api/agent/:sessionId — current agent state (running set + live state).
export async function getAgentState({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });

  try {
    const session = getRpcSession(sessionId);
    if (!session || !session.isAlive()) {
      return json({ running: false });
    }
    try {
      const state = await session.send({ type: 'get_state' });
      // Dialogs omp is still blocked on: a client that reloaded mid-ask has no
      // other way to learn the request id it must answer, and omp never
      // re-emits the frame.
      return json({ running: true, state, pendingUiRequests: session.getPendingUiDialogs() });
    } catch (error) {
      if (error instanceof WebRpcError && error.code === 'session_unresponsive') {
        return json({ running: false, recovered: true });
      }
      throw error;
    }
  } catch (error) {
    return rpcErrorResponse(error);
  }
}
