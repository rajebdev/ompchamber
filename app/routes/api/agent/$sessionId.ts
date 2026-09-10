import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { findSessionFileById } from '@/lib/omp/session/locator';
import { readRawHeaderLine } from '@/lib/omp/session/files';
import { startRpcSession, getRpcSession, resolveSpawnCwd, WebRpcError } from '@/lib/omp/rpc/manager';
import { RpcCommandError, RpcCommandTimeoutError } from '@/lib/omp/rpc/process';

function commandErrorResponse(error: unknown) {
  if (error instanceof WebRpcError) {
    return json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof RpcCommandTimeoutError) {
    return json({ error: error.message, code: 'rpc_command_timeout' }, { status: 400 });
  }
  if (error instanceof RpcCommandError) {
    return json({ error: error.message, code: error.code ?? 'rpc_command_failed' }, { status: 400 });
  }
  return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
}

/** Resolve the session file path (OMP UUID → .jsonl) and its recorded cwd. */
function resolveSessionPathOr404(sessionId: string): { filePath: string; recordedCwd: string | null } | { response: Response } {
  const filePath = findSessionFileById(sessionId);
  if (!filePath) return { response: json({ error: 'Session not found' }, { status: 404 }) };
  let recordedCwd: string | null = null;
  const header = readRawHeaderLine(filePath);
  if (header && typeof header.cwd === 'string') recordedCwd = header.cwd;
  return { filePath, recordedCwd };
}

// POST /api/agent/:sessionId — send a command to an existing session (or spawn
// it lazily). Mirrors omp-web's /api/agent/[id].
export async function action({ params, request }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.type !== 'string' || !body.type.trim()) {
      return json({ error: 'command type is required', code: 'command_type_required' }, { status: 400 });
    }

    // Fast path: already-running session.
    const existing = getRpcSession(sessionId);
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      return json({ success: true, data: result });
    }

    const resolved = resolveSessionPathOr404(sessionId);
    if ('response' in resolved) return resolved.response;
    const { filePath, recordedCwd } = resolved;

    const cwd = resolveSpawnCwd(recordedCwd);
    const { session } = await startRpcSession(sessionId, filePath, cwd, recordedCwd);
    const result = await session.send(body);
    return json({ success: true, data: result });
  } catch (error) {
    return commandErrorResponse(error);
  }
}

// GET /api/agent/:sessionId — current agent state (running set + live state).
export async function loader({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });

  try {
    const session = getRpcSession(sessionId);
    if (!session || !session.isAlive()) {
      return json({ running: false });
    }
    try {
      const state = await session.send({ type: 'get_state' });
      return json({ running: true, state });
    } catch (error) {
      if (error instanceof WebRpcError && error.code === 'session_unresponsive') {
        return json({ running: false, recovered: true });
      }
      throw error;
    }
  } catch (error) {
    return commandErrorResponse(error);
  }
}
