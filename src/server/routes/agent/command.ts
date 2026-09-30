import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { resolveSessionPathOr404 } from '@/server/lib/omp/session/locator';
import { WebRpcError, getRpcSession, resolveSpawnCwd, startRpcSession, type AgentSessionWrapper } from '@/server/lib/omp/rpc/manager';
import { getSpawnApprovalMode, reconcileSpawnApprovalMode } from '@/server/lib/omp/rpc/session-registry';
import { isApprovalMode } from '@/shared/lib/omp/config/access-mode';
import { loadPersistedAccessMode } from '@/shared/lib/omp/config/access-mode.server';
import { CONVERSATION_MOVING_COMMANDS, OBSERVER_ONLY_COMMANDS } from '@/server/lib/omp/rpc/constants';
import { rpcErrorResponse } from '@/server/lib/omp/rpc/errors';
import { assertBtwIdle } from '@/server/lib/btw/service.server';
import { loadPersistedModes } from '@/server/lib/omp/session/modes';
import { modeCommandPrompt, parseModeRequest, parseModeSelection } from '@/server/lib/omp/mode/request';
import { chamberModeEnv } from '@/server/lib/omp/extensions/locator';

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

    // A command that moves the conversation is refused while a side question is
    // in flight on this session — the question's snapshot describes the
    // transcript this command would replace (omp blocks the same operations).
    if (CONVERSATION_MOVING_COMMANDS.has(body.type)) {
      await assertBtwIdle(sessionId, body.type.replace(/_/g, ' '));
    }

    // Plan/Goal mode control. Translated to a `/chamber-mode …` prompt for the
    // chamber-owned extension inside the child: no RPC verb exists for either
    // mode, and this path costs no transcript entry (the command is answered
    // locally). A live session is re-targeted in place — unlike the approval
    // mode, a mode change needs NO respawn.
    //
    // A session with no live child is spawned first, because the toggle is
    // usually the FIRST thing a user does on a reopened chat: the composer
    // renders from the persisted selection, and pressing the button is what
    // makes the child exist.
    const modeRequest = body.type === 'chamber_mode' ? parseModeRequest(body) : null;
    if (body.type === 'chamber_mode' && !modeRequest) {
      return json({ error: 'scope (plan|goal) and action are required', code: 'invalid_mode_request' }, { status: 400 });
    }
    // One translation, used by both dispatch paths below: a mode command is a
    // local extension command inside the child, never an RPC verb.
    const forwarded = modeRequest ? { type: 'prompt', message: modeCommandPrompt(modeRequest) } : body;

    // Fast path: already-running session.
    const existing = getRpcSession(sessionId);
    if (existing?.isAlive()) {
      // A mid-conversation change is honoured by destroying the idle process so
      // the spawn path below restarts it with the new --approval-mode flag.
      const liveMode = explicitMode ?? getSpawnApprovalMode(existing);
      if (!(await reconcileSpawnApprovalMode(existing, liveMode))) {
        const result = await existing.send(forwarded);
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
    // The mode selection rides the spawn ENVIRONMENT, because `--mode rpc-ui`
    // never restores `mode_change` and the child's first command is the earliest
    // moment anything could re-apply it. Read from the session's own JSONL, so a
    // chamber restart, a second instance, or a CLI-driven session all agree.
    const persisted = body.modes !== undefined ? parseModeSelection(body as Record<string, unknown>) : await loadPersistedModes(filePath);
    const modeEnv = chamberModeEnv({ plan: persisted.plan, goal: persisted.goal, goalLive: persisted.goalLive });
    const { session } = await startRpcSession(sessionId, filePath, cwd, recordedCwd, spawnMode, modeEnv);
    const result = await session.send(forwarded);
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
    return json({
      running: true,
      state,
      pendingUiRequests: session.getPendingUiDialogs(),
      // The child's own goal state. The composer's Goal toggle reads this on
      // reattach so a run driven from another tab (or the CLI) does not leave
      // the toggle showing the client's stale last request.
      goal: { enabled: session.hasLiveGoal, status: session.goalStatus },
    });
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
