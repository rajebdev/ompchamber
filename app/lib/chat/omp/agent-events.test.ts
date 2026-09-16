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
  const activity: string[] = [];
  let state: OmpAgentState = { isGenerating: false, connected: true, error: null };
  const callbacks: OmpAgentCallbacks = {
    onMessageEnd: (msg) => ended.push(msg),
    onActivity: (verb) => activity.push(verb),
  };
  const deps: OmpAgentFoldDeps = {
    sessionId: 's1',
    setState: (update) => {
      state = typeof update === 'function' ? update(state) : update;
    },
    callbacksRef: { current: callbacks },
    toolResultsRef: { current: new Map<string, { output: string }>() },
    lastToolMessageRef: { current: null },
    interruptPendingRef: { current: false },
    activityRef: { current: '' },
  };
  return { deps, ended, activity };
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

describe('foldAgentEvent activity phrases', () => {
  test('names the tool being executed, not a generic reasoning verb', () => {
    const { deps, activity } = makeDeps();
    foldAgentEvent({ type: 'agent_start' }, deps);
    foldAgentEvent({
      type: 'tool_execution_start',
      toolCallId: 'c1',
      toolName: 'edit',
      args: { path: 'app/lib/chat/order.ts', old_string: 'a', new_string: 'b' },
    }, deps);
    expect(activity).toEqual(['Thinking', 'Editing app/lib/chat/order.ts']);
  });

  test('resolves an xd:// device write to the device action', () => {
    const { deps, activity } = makeDeps();
    foldAgentEvent({
      type: 'tool_execution_start',
      toolCallId: 'c2',
      toolName: 'write',
      args: { path: 'xd://ast_edit', content: JSON.stringify({ pat: 'x', out: 'y', paths: ['src/**/*.ts'] }) },
    }, deps);
    expect(activity).toEqual(['Rewriting AST src/**/*.ts']);
  });

  test('follows the assistant phase before any tool starts', () => {
    const { deps, activity } = makeDeps();
    foldAgentEvent({ type: 'message_update', message: { role: 'assistant', content: [] }, assistantMessageEvent: { type: 'thinking_delta', delta: 'x' } }, deps);
    foldAgentEvent({ type: 'message_update', message: { role: 'assistant', content: [] }, assistantMessageEvent: { type: 'text_delta', delta: 'x' } }, deps);
    foldAgentEvent({
      type: 'message_update',
      message: { role: 'assistant', content: [] },
      assistantMessageEvent: { type: 'toolcall_end', toolCall: { id: 'c3', name: 'bash', arguments: { command: 'bun test' } } },
    }, deps);
    expect(activity).toEqual(['Thinking', 'Writing response', 'Running bun test']);
  });

  test('does not re-publish the same phrase for per-token frames', () => {
    const { deps, activity } = makeDeps();
    for (let i = 0; i < 5; i++) {
      foldAgentEvent({ type: 'message_update', message: { role: 'assistant', content: [] }, assistantMessageEvent: { type: 'thinking_delta', delta: 'x' } }, deps);
    }
    expect(activity).toEqual(['Thinking']);
  });

  test('never emits a dangling verb for a tool call with empty arguments', () => {
    const { deps, activity } = makeDeps();
    foldAgentEvent({ type: 'tool_execution_start', toolCallId: 'c4', toolName: 'bash', args: {} }, deps);
    expect(activity).toEqual(['bash']);
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
