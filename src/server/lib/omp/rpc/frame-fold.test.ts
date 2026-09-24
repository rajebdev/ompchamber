/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wiring of the auto-title trigger into the frame fold.
 *
 * The trigger itself is covered by `session/auto-title.server.test.ts`; what
 * these tests pin is WHEN the fold reaches it. That timing is load-bearing and
 * was measured against omp 18.3.0: `agent_start` fires before the turn opens, so
 * the transcript is still empty there and a title asked for at that point comes
 * back "Could not generate a session title".
 *
 * The host carries no session id, so `triggerAutoSessionTitle` returns before it
 * touches the settings database. The stage flags it flips on the way are the
 * observable proof that the branch was reached.
 */

import { describe, expect, test } from 'bun:test';

import { foldSessionFrame, type SessionFrameHost } from '@/server/lib/omp/rpc/frame-fold';
import type { AgentEvent } from '@/server/lib/omp/rpc/constants';

function makeHost(): SessionFrameHost {
  return {
    sessionId: '',
    autoTitleInFlight: false,
    autoTitleWindowUntil: 0,
    autoTitlePending: true,
    autoTitleRequested: false,
    promptRunning: false,
    streaming: false,
    compacting: false,
    awaitingAgentStart: false,
    awaitingAgentStartDeadline: 0,
    continuationGraceUntil: 0,
    proc: { sendCommand: async () => undefined as never },
    emit() {},
    trackUiDialog() {},
    observeSubagent() {},
    isAlive: () => true,
    isBusy: () => false,
    send: async () => undefined,
  };
}

/** Fold one frame and report the flags the trigger leaves behind. */
function fold(host: SessionFrameHost, event: AgentEvent): void {
  foldSessionFrame(host, event);
}

describe('auto-title trigger wiring', () => {
  test('asks for the title on the first settled user message', () => {
    const host = makeHost();
    fold(host, { type: 'message_end', message: { role: 'user', content: 'fix the sidebar' } });

    expect(host.autoTitleRequested).toBe(true);
    // The early attempt leaves the eligibility latch alone so the run end can
    // still retry it.
    expect(host.autoTitlePending).toBe(true);
  });

  test('does not ask on an assistant or tool message', () => {
    for (const role of ['assistant', 'toolResult', 'custom']) {
      const host = makeHost();
      fold(host, { type: 'message_end', message: { role, content: 'x' } });
      expect(host.autoTitleRequested).toBe(false);
    }
  });

  test('does not ask at agent_start, where the transcript is still empty', () => {
    // The whole reason the trigger is not on this frame: omp pushes
    // `agent_start` before the turn opens, so a `/rename` here reads
    // `messageCount: 0` and omp declines to generate anything.
    const host = makeHost();
    fold(host, { type: 'agent_start' });

    expect(host.autoTitleRequested).toBe(false);
    expect(host.autoTitlePending).toBe(true);
  });

  test('resets the early-attempt flag so a later run gets its own try', () => {
    const host = makeHost();
    fold(host, { type: 'message_end', message: { role: 'user', content: 'first' } });
    expect(host.autoTitleRequested).toBe(true);

    // A run that opens after an aborted one (which skipped the settle attempt)
    // must still be able to ask.
    fold(host, { type: 'agent_start' });
    expect(host.autoTitleRequested).toBe(false);
  });

  test('retries at the terminal run end and consumes the latch there', () => {
    const host = makeHost();
    fold(host, { type: 'message_end', message: { role: 'user', content: 'first' } });

    fold(host, { type: 'agent_end', isTerminal: true, messages: [] });

    // Consumed: this conversation is never titled again after the fallback.
    expect(host.autoTitlePending).toBe(false);
  });

  test('skips the fallback for an aborted run', () => {
    // A stopped turn is not a settle: the next completed run is a better moment
    // than a half-run transcript, and the latch must survive for it.
    const host = makeHost();
    fold(host, { type: 'message_end', message: { role: 'user', content: 'first' } });
    fold(host, {
      type: 'agent_end',
      isTerminal: true,
      messages: [{ role: 'assistant', stopReason: 'aborted' }],
    });

    expect(host.autoTitlePending).toBe(true);
  });

  test('does not retry on a non-terminal agent_end', () => {
    const host = makeHost();
    fold(host, { type: 'agent_end', isTerminal: false, messages: [] });

    expect(host.autoTitlePending).toBe(true);
  });
});
