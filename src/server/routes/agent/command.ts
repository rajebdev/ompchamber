import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { resolveSessionPathOr404 } from '@/server/lib/omp/session/locator';
import { WebRpcError, getRpcSession, resolveSpawnCwd, startRpcSession, type AgentSessionWrapper } from '@/server/lib/omp/rpc/manager';
import { getSpawnApprovalMode, reconcileSpawnApprovalMode } from '@/server/lib/omp/rpc/session-registry';
import { isApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { loadPersistedAccessMode } from '@/shared/lib/omp/config/access-mode.server';
import { OBSERVER_ONLY_COMMANDS } from '@/server/lib/omp/rpc/constants';
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

    // Observer-only reads must never boot an omp child. This route is the spawn
    // path, so a roster snapshot (`get_subagents`) or a transcript page
    // (`get_subagent_messages`) posted for a session the chamber is not
    // managing would start a whole process just to answer a read — measured:
    // opening a FINISHED session's roster row grew the omp process count, and
    // the sidebar renders those rows for every session in the list. Both reads
    // have RPC-free on-disk equivalents (`GET /api/sessions/:id/subagents[/:sub]`),
    // which is what a dead session is served from; the live registry is only
    // consulted while a process exists to answer for.
    if (OBSERVER_ONLY_COMMANDS.has(body.type)) {
      return json({ error: 'Session is not managed by the chamber', code: 'session_not_running' }, { status: 409 });
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

/** RPC-free view of a busy session. `state` carries only the two flags the
 *  attach probe reads; the full snapshot resumes once the turn settles. */
function busySessionPayload(session: AgentSessionWrapper) {
  return {
    running: true,
    busy: true,
    state: { isStreaming: session.streaming, isPromptRunning: session.promptRunning },
    pendingUiRequests: session.getPendingUiDialogs(),
  };
}

// GET /api/agent/:sessionId — current agent state (running set + live state).
export async function getAgentState({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });

  const session = getRpcSession(sessionId);
  if (!session || !session.isAlive()) {
    return json({ running: false });
  }

  // A busy session answers from local flags: its `get_state` would queue behind
  // the running turn (omp runs RPC handlers one at a time), and a timeout there
  // is no reason to reset a session that is demonstrably working — subagents
  // included. These flags are all the client needs to reattach its stream.
  if (session.isBusy()) return json(busySessionPayload(session));

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
    // A turn started between the check above and the RPC: report busy, not dead.
    if (error instanceof WebRpcError && error.code === 'session_busy') {
      return json(busySessionPayload(session));
    }
    return rpcErrorResponse(error);
  }
}
