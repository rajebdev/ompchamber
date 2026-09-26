/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The spawn guard on POST /api/agent/:sessionId.
 *
 * This route is the chamber's ONLY lazy-spawn path: a command posted for a
 * session it does not manage starts an `omp` child for it. That is right for a
 * prompt — the user asked for work — and wrong for a read. The sidebar renders
 * a subagent roster row for every session in the list, and the roster probes
 * `get_subagents` to seed itself, so an unguarded route booted a whole omp
 * process per finished session merely LOOKED at (measured: the process count
 * grew on a session whose liveness probe had just answered `running: false`).
 *
 * Both observer-only commands have RPC-free on-disk equivalents, which is what
 * a finished session is served from, so refusing them for a dead session costs
 * the client nothing.
 *
 * No module is mocked. The assertions are about which response comes back
 * BEFORE the spawn path is reached, so the real registry (empty for these ids)
 * and the real on-disk resolver are exactly the inputs that matter. The
 * "prompt" case proves the guard is not a blanket refusal: it reaches the
 * resolver and 404s for an id with no session file — a spawn was attempted.
 */

import { describe, expect, test } from 'bun:test';
import { sendCommand } from '@/server/routes/agent/command';

/** Ids that no chamber instance manages and no session file backs. */
const DEAD = 'spawn-guard-dead-session';
const UNKNOWN = 'spawn-guard-unknown-session';

function post(sessionId: string, body: Record<string, unknown>): Promise<Response> {
  return sendCommand({
    params: { sessionId },
    request: new Request(`http://localhost/api/agent/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as never) as Promise<Response>;
}

async function payload(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('agent command spawn guard', () => {
  test('refuses a roster snapshot for a session that is not running', async () => {
    const response = await post(DEAD, { type: 'get_subagents' });
    expect(response.status).toBe(409);
    expect(await payload(response)).toMatchObject({ code: 'session_not_running' });
  });

  test('refuses a transcript page for a session that is not running', async () => {
    const response = await post(DEAD, { type: 'get_subagent_messages', subagentId: 'child' });
    expect(response.status).toBe(409);
    expect(await payload(response)).toMatchObject({ code: 'session_not_running' });
  });

  test('does not refuse a command that asks for work', async () => {
    const response = await post(UNKNOWN, { type: 'prompt', message: 'hello' });
    // It reached the spawn path and failed there (no session file on disk),
    // which is the opposite of the guard's 409.
    expect(response.status).not.toBe(409);
  });
});
