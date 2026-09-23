/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import {
  consumeAutoTitleOutput,
  markTitleRequestSent,
  triggerAutoSessionTitle,
  type AutoTitleHost,
} from '@/server/lib/omp/session/auto-title.server';

/**
 * The safety property of auto-titling, and the one thing that must never
 * regress: the chamber fires omp's own `/rename` (which persists through
 * `setSessionName(title, "user")`) in the background, and that write has no
 * "don't overwrite" guard of its own — omp only refuses an `"auto"` write over
 * a `"user"` title. So the decision to skip a NAMED session is ours, and a bug
 * here silently destroys a name the operator typed.
 *
 * These tests drive the guard directly: a fake `get_state` reports a name, and
 * the assertion is that no `/rename` reaches the wire.
 */

interface FakeProc {
  commands: Array<Record<string, unknown>>;
  sendCommand<T>(command: { type: string; [key: string]: unknown }): Promise<T>;
}

function makeHost(options: {
  sessionName?: string;
  sessionId?: string;
  inFlight?: boolean;
}): { host: AutoTitleHost; proc: FakeProc } {
  const proc: FakeProc = {
    commands: [],
    async sendCommand<T>(command: { type: string; [key: string]: unknown }): Promise<T> {
      proc.commands.push(command);
      if (command.type === 'get_state') {
        return {
          sessionId: options.sessionId ?? 'sess-1',
          sessionName: options.sessionName,
        } as T;
      }
      return undefined as T;
    },
  };
  return {
    host: {
      sessionId: 'sess-1',
      autoTitleInFlight: options.inFlight ?? false,
      autoTitleWindowUntil: 0,
      proc: proc as unknown as AutoTitleHost['proc'],
    },
    proc,
  };
}

/** Commands other than the `get_state` probe the guard always performs. */
function sentRenames(proc: FakeProc): Array<Record<string, unknown>> {
  return proc.commands.filter((command) => command.type === 'prompt');
}

describe('triggerAutoSessionTitle', () => {
  test('names an unnamed session through omp own /rename', async () => {
    const { host, proc } = makeHost({});
    await triggerAutoSessionTitle(host);

    const renames = sentRenames(proc);
    expect(renames).toHaveLength(1);
    expect(renames[0].message).toBe('/rename');
    // The request window opens only after the command is accepted, so the
    // diagnostics omp is about to emit can be attributed to us.
    expect(host.autoTitleWindowUntil).toBeGreaterThan(Date.now());
  });

  test('never overwrites a name the operator set', async () => {
    const { host, proc } = makeHost({ sessionName: 'My Deliberate Name' });
    await triggerAutoSessionTitle(host);

    expect(sentRenames(proc)).toHaveLength(0);
    // No request was sent, so nothing may claim the output window either.
    expect(host.autoTitleWindowUntil).toBe(0);
  });

  test('treats a whitespace-only name as unnamed', async () => {
    const { host, proc } = makeHost({ sessionName: '   ' });
    await triggerAutoSessionTitle(host);

    expect(sentRenames(proc)).toHaveLength(1);
  });

  test('skips when the session changed under the read', async () => {
    // `get_state` answered for a different conversation (a reset or switch
    // between the trigger and the read) — titling this session would name the
    // wrong one.
    const { host, proc } = makeHost({ sessionId: 'someone-else' });
    await triggerAutoSessionTitle(host);

    expect(sentRenames(proc)).toHaveLength(0);
  });

  test('does not stack a second request while one is in flight', async () => {
    const { host, proc } = makeHost({ inFlight: true });
    await triggerAutoSessionTitle(host);

    expect(sentRenames(proc)).toHaveLength(0);
    expect(proc.commands).toHaveLength(0);
  });
});

describe('auto-title output window', () => {
  test('claims exactly one frame per request', () => {
    const { host } = makeHost({});
    markTitleRequestSent(host);

    expect(consumeAutoTitleOutput(host)).toBe(true);
    // omp emits a single command_output per /rename; a second frame inside the
    // window belongs to something the operator typed and must reach the UI.
    expect(consumeAutoTitleOutput(host)).toBe(false);
  });

  test('claims nothing when no request is outstanding', () => {
    const { host } = makeHost({});
    expect(consumeAutoTitleOutput(host)).toBe(false);
  });

  test('expires so a stale window cannot swallow an operator command', () => {
    const { host } = makeHost({});
    markTitleRequestSent(host);
    host.autoTitleWindowUntil = Date.now() - 1;

    expect(consumeAutoTitleOutput(host)).toBe(false);
  });
});
