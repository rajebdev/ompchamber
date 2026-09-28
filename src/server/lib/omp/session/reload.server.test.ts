/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * omp discovers plugins once per process, so a skill written while a session
 * runs is invisible to it until a reload. `/reload-plugins` is the refresh, and
 * it is only safe to send to an IDLE session: it answers `agentInvoked: false`
 * (no model turn, nothing written to the transcript), but a prompt dispatched
 * into a RUNNING turn is a queue insert with user-visible consequences. The
 * busy guard is therefore an invariant, not an optimization — a broadcast that
 * ignored it would inject a command into every in-flight turn.
 */

import { afterAll, describe, expect, mock, test } from 'bun:test';

interface FakeSession {
  sessionId: string;
  isBusy: () => boolean;
  send: (command: unknown) => Promise<unknown>;
}

const sent: Array<{ sessionId: string; command: unknown }> = [];
let sessions: FakeSession[] = [];
let failFor: string | null = null;

mock.module('@/server/lib/omp/rpc/session-registry', () => ({
  listRpcSessions: () => sessions,
}));

// Static import cannot work here: `mock.module` only intercepts modules
// registered BEFORE the importer is evaluated, so the module under test has to
// load after the mock is in place.
const { reloadLiveSessions } = await import('@/server/lib/omp/session/reload.server');

function session(sessionId: string, busy: boolean): FakeSession {
  return {
    sessionId,
    isBusy: () => busy,
    async send(command: unknown) {
      if (failFor === sessionId) throw new Error('session gone');
      sent.push({ sessionId, command });
      return { agentInvoked: false };
    },
  };
}

describe('reloadLiveSessions', () => {
  test('sends /reload-plugins to idle sessions only', async () => {
    sent.length = 0;
    failFor = null;
    sessions = [session('idle-1', false), session('busy-1', true), session('idle-2', false)];

    const reloaded = await reloadLiveSessions();

    expect(reloaded.sort()).toEqual(['idle-1', 'idle-2']);
    expect(sent.map((entry) => entry.sessionId).sort()).toEqual(['idle-1', 'idle-2']);
    // The prompt form is the point: no RPC command exists for a reload.
    expect(sent.every((entry) => JSON.stringify(entry.command) === JSON.stringify({ type: 'prompt', message: '/reload-plugins' }))).toBe(true);
  });

  test('a failing session does not stop the others', async () => {
    sent.length = 0;
    failFor = 'idle-1';
    sessions = [session('idle-1', false), session('idle-2', false)];

    const reloaded = await reloadLiveSessions();

    expect(reloaded).toEqual(['idle-2']);
    expect(sent.map((entry) => entry.sessionId)).toEqual(['idle-2']);
  });

  test('no live sessions is a no-op', async () => {
    sent.length = 0;
    failFor = null;
    sessions = [];

    expect(await reloadLiveSessions()).toEqual([]);
    expect(sent.length).toBe(0);
  });
});

afterAll(() => {
  mock.restore();
});
