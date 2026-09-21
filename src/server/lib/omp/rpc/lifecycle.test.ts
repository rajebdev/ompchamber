/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The wrapper's lifecycle rules: which conditions may reclaim a session's omp
 * process. A reset kills the whole process group, so a wrong answer here
 * destroys a live turn and every subagent under it.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';

import { AgentSessionWrapper, WebRpcError } from '@/server/lib/omp/rpc/manager';
import { RpcCommandTimeoutError, type RpcProcess } from '@/server/lib/omp/rpc/process';

/** Commands whose ack is fabricated as timed out; everything else resolves, so
 *  only the timeout policy is under test. */
const TIMED_OUT_COMMANDS: Record<string, true> = { get_state: true, prompt: true };

interface StubProcess {
  proc: RpcProcess;
  emit(frame: Record<string, unknown>): void;
  disposeCount(): number;
}

function makeProc(): StubProcess {
  let listener: ((frame: unknown) => void) | null = null;
  let disposals = 0;
  const proc = {
    isAlive: true,
    pid: 4242,
    onFrame(next: (frame: unknown) => void) {
      listener = next;
      return () => {
        listener = null;
      };
    },
    sendCommand(command: { type: string }) {
      if (TIMED_OUT_COMMANDS[command.type] === true) {
        return Promise.reject(new RpcCommandTimeoutError(command.type, 1));
      }
      return Promise.resolve(undefined);
    },
    sendFrame() {},
    async dispose() {
      disposals += 1;
    },
  };
  return {
    proc: proc as unknown as RpcProcess,
    emit: (frame) => listener?.(frame),
    disposeCount: () => disposals,
  };
}

async function rejectionOf(operation: Promise<unknown>): Promise<WebRpcError> {
  const error = await operation.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(WebRpcError);
  return error as WebRpcError;
}

describe('AgentSessionWrapper lifecycle', () => {
  // Every command arms the wrapper's idle timer; keep the clock fake so a test
  // never schedules a real ten-minute window.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('resets a session that ignores commands while idle', async () => {
    const stub = makeProc();
    const wrapper = new AgentSessionWrapper(stub.proc, '/tmp');

    const error = await rejectionOf(wrapper.send({ type: 'get_state' }));

    expect(error.code).toBe('session_unresponsive');
    expect(stub.disposeCount()).toBe(1);
  });

  test('keeps the process when a get_state times out mid-turn', async () => {
    const stub = makeProc();
    const wrapper = new AgentSessionWrapper(stub.proc, '/tmp');
    wrapper.start();
    stub.emit({ type: 'agent_start' });

    const error = await rejectionOf(wrapper.send({ type: 'get_state' }));

    expect(error.code).toBe('session_busy');
    expect(stub.disposeCount()).toBe(0);
    expect(wrapper.isRunning()).toBe(true);
  });

  test('keeps the process when a prompt ack times out mid-turn', async () => {
    const stub = makeProc();
    const wrapper = new AgentSessionWrapper(stub.proc, '/tmp');
    wrapper.start();
    stub.emit({ type: 'agent_start' });

    const error = await rejectionOf(wrapper.send({ type: 'prompt', message: 'hi' }));

    expect(error.code).toBe('session_busy');
    expect(stub.disposeCount()).toBe(0);
  });

  test('idle reclaim waits for subagents that outlive the turn', () => {
    const stub = makeProc();
    const wrapper = new AgentSessionWrapper(stub.proc, '/tmp', null, { idleDestroyMs: 20 });
    wrapper.start();

    stub.emit({ type: 'agent_start' });
    stub.emit({ type: 'agent_end', isTerminal: true });
    stub.emit({ type: 'subagent_lifecycle', payload: { id: 's1', status: 'started', index: 0 } });
    expect(wrapper.isRunning()).toBe(false);
    expect(wrapper.isBusy()).toBe(true);

    vi.advanceTimersByTime(200);
    expect(stub.disposeCount()).toBe(0);

    stub.emit({ type: 'subagent_lifecycle', payload: { id: 's1', status: 'completed', index: 0 } });
    expect(wrapper.isBusy()).toBe(false);

    vi.advanceTimersByTime(200);
    expect(stub.disposeCount()).toBe(1);
  });

  test('force_reset reclaims a process whose turn will not stop', async () => {
    const stub = makeProc();
    const wrapper = new AgentSessionWrapper(stub.proc, '/tmp');
    stub.emit({ type: 'agent_start' });

    await wrapper.send({ type: 'force_reset' });

    expect(stub.disposeCount()).toBe(1);
  });
});
