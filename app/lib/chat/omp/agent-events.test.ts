/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import type { ChatMessageData, OmpAgentCallbacks, OmpAgentState } from '@/types';
import { foldAgentEvent, type OmpAgentFoldDeps } from '@/lib/chat/omp/agent-events';
import { toChatMessage } from '@/lib/omp/session/mapper';

/** Real shape omp writes on a user abort: empty content plus flat
 *  stopReason/errorMessage/errorId fields — there is no nested `error`. */
const ABORTED_TURN = {
  role: 'assistant',
  content: [{ type: 'text', text: '' }],
  provider: 'openai',
  model: 'gpt-5',
  stopReason: 'aborted',
  errorMessage: 'Interrupted by user',
  errorId: 67112960,
  timestamp: 1757943900000,
};

function makeDeps() {
  const ended: ChatMessageData[] = [];
  let state: OmpAgentState = { isGenerating: false, connected: true, error: null };
  const callbacks: OmpAgentCallbacks = { onMessageEnd: (msg) => ended.push(msg) };
  const deps: OmpAgentFoldDeps = {
    sessionId: 's1',
    setState: (update) => {
      state = typeof update === 'function' ? update(state) : update;
    },
    callbacksRef: { current: callbacks },
    toolResultsRef: { current: new Map<string, { output: string }>() },
    lastToolMessageRef: { current: null },
    interruptPendingRef: { current: false },
  };
  return { deps, ended };
}

describe('toChatMessage error derivation', () => {
  test('keeps an aborted turn that carries no text', () => {
    const msg = toChatMessage(ABORTED_TURN, false);
    expect(msg).not.toBeNull();
    expect(msg?.error?.message).toBe('Interrupted by user');
    expect(msg?.error?.stopReason).toBe('aborted');
  });

  test('leaves a normally finished turn without an error', () => {
    const msg = toChatMessage({ ...ABORTED_TURN, stopReason: 'end_turn', errorMessage: undefined }, false);
    expect(msg?.error).toBeUndefined();
  });
});

describe('foldAgentEvent agent_end', () => {
  test('materializes an aborted turn that never arrived as message_end', () => {
    const { deps, ended } = makeDeps();
    foldAgentEvent({ type: 'agent_start' }, deps);
    foldAgentEvent({ type: 'agent_end', messages: [ABORTED_TURN] }, deps);
    expect(ended).toHaveLength(1);
    expect(ended[0]?.error?.message).toBe('Interrupted by user');
    expect(ended[0]?.error?.stopReason).toBe('aborted');
  });

  test('ignores a turn that finished normally', () => {
    const { deps, ended } = makeDeps();
    foldAgentEvent({ type: 'agent_end', messages: [{ ...ABORTED_TURN, stopReason: 'end_turn' }] }, deps);
    expect(ended).toHaveLength(0);
  });
});
