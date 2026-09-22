/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The sidebar is signalled on the run's FIRST completed assistant turn (not on
 * every assistant segment, not on user turns, and not on notice rows), and the
 * guard re-arms at every run start / stream reattach. `omp:session-updated`
 * rides a leading+trailing throttle, so an extra dispatch per assistant segment
 * would keep resetting that window and delay the refresh it exists to trigger.
 *
 * One case is driven through `foldAgentEvent` with a real omp frame: the
 * callbacks see the MAPPED chamber role (`assistant` → `ai`), which a
 * hand-built message would hide.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  createOmpAgentCallbacks,
  type OmpAgentCallbacksDeps,
} from '@/shared/lib/chat/timeline/omp-callbacks';
import { foldAgentEvent, type OmpAgentFoldDeps } from '@/shared/lib/chat/omp/agent-events';
import type { ChatMessageData, OmpAgentCallbacks, OmpAgentState } from '@/shared/types';

/** omp's own shape for a completed assistant turn, before the mapper runs. */
const OMP_ASSISTANT_TURN = {
  role: 'assistant',
  content: [{ type: 'text', text: 'hi' }],
  timestamp: 1757943900000,
};

const assistantTurn = (id: string): ChatMessageData => ({ id, role: 'ai', content: 'hi' });
const userTurn = (id: string): ChatMessageData => ({ id, role: 'user', content: 'yo' });
const noticeRow = (id: string): ChatMessageData => ({ id, role: 'ai', content: '', notice: 'job done' });

describe('createOmpAgentCallbacks first-assistant sidebar signal', () => {
  const signals: Array<{ name: string; sessionId?: string }> = [];

  // `bun test` runs without a DOM: the dispatch site is window-guarded, so the
  // suite installs a recording stub and removes it again.
  const installWindowStub = () => {
    Object.assign(globalThis, {
      window: {
        dispatchEvent: (event: Event) => {
          const custom = event as CustomEvent<{ sessionId?: string }>;
          signals.push({ name: custom.type, sessionId: custom.detail?.sessionId });
          return true;
        },
      },
    });
  };

  beforeEach(() => {
    signals.length = 0;
    installWindowStub();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  function makeCallbacks(): OmpAgentCallbacks {
    const deps: OmpAgentCallbacksDeps = {
      setGenerating: () => {},
      setGeneratingVerb: () => {},
      scrollToBottom: () => {},
      adoptedSessionIdRef: { current: null },
      sessionIdRef: { current: 'sess-1' },
      metaRefreshedRef: { current: null },
      firstAssistantRef: { current: false },
      refreshSessionMeta: () => {},
      setLocalMessages: () => {},
      aiPlaceholderIdRef: { current: null },
      optimisticUserIdRef: { current: null },
      pendingUserDisplaysRef: { current: [] },
      persistMessages: () => {},
      abortControllerRef: { current: null },
      appSettings: {},
      enqueueExtensionDialog: () => {},
      withdrawExtensionDialog: () => {},
    };
    return createOmpAgentCallbacks(deps);
  }

  function makeFoldDeps(callbacks: OmpAgentCallbacks): OmpAgentFoldDeps {
    let state: OmpAgentState = { isGenerating: false, connected: true, error: null };
    return {
      sessionId: 'sess-1',
      setState: (update) => {
        state = typeof update === 'function' ? update(state) : update;
      },
      callbacksRef: { current: callbacks },
      toolResultsRef: { current: new Map<string, { output: string }>() },
      lastToolMessageRef: { current: null },
      interruptPendingRef: { current: false },
      activityRef: { current: '' },
      currentThinkingLevelRef: { current: undefined },
      fileMutatingCallsRef: { current: new Set<string>() },
    };
  }

  test('signals on the first completed assistant turn of each run only', () => {
    const callbacks = makeCallbacks();

    callbacks.onAgentStart?.();
    expect(signals.map(s => s.name)).toEqual(['omp:session-updated']);

    callbacks.onMessageEnd?.(assistantTurn('a1'));
    expect(signals).toHaveLength(2);
    expect(signals[1]?.sessionId).toBe('sess-1');

    // Later segments of the same run, and the steering user echo, stay silent.
    callbacks.onMessageEnd?.(assistantTurn('a2'));
    callbacks.onMessageEnd?.(userTurn('u2'));
    expect(signals).toHaveLength(2);

    // The next run re-arms the guard.
    callbacks.onAgentStart?.();
    callbacks.onMessageEnd?.(assistantTurn('a3'));
    expect(signals).toHaveLength(4);
  });

  test('re-arms on a mid-run stream reattach', () => {
    const callbacks = makeCallbacks();

    callbacks.onResumeStream?.();
    callbacks.onMessageEnd?.(assistantTurn('a1'));
    callbacks.onMessageEnd?.(assistantTurn('a2'));

    expect(signals).toHaveLength(2);
  });

  test('onTurnStart signals the sidebar on every turn of the run', () => {
    const callbacks = makeCallbacks();

    callbacks.onTurnStart?.();
    callbacks.onTurnStart?.();
    expect(signals).toHaveLength(2);
    expect(signals.every(s => s.name === 'omp:session-updated' && s.sessionId === 'sess-1')).toBe(true);
  });

  test('never signals from user turns or notice rows alone', () => {
    const callbacks = makeCallbacks();

    callbacks.onMessageEnd?.(userTurn('u1'));
    callbacks.onMessageEnd?.(noticeRow('n1'));

    expect(signals).toHaveLength(0);
  });

  test('a real omp assistant message_end frame reaches the signal once', () => {
    const deps = makeFoldDeps(makeCallbacks());

    foldAgentEvent({ type: 'agent_start' }, deps);
    foldAgentEvent({ type: 'message_end', message: OMP_ASSISTANT_TURN }, deps);
    foldAgentEvent({ type: 'message_end', message: { ...OMP_ASSISTANT_TURN, timestamp: 1757943901000 } }, deps);

    expect(signals).toHaveLength(2);
  });
});
