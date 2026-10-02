/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The `useOmpAgent` reload-probe half of `stream.test.ts`: reattach on
 * remount for a mid-run session. Split verbatim so both files stay under the
 * repo's 350-line ceiling; the head file keeps the stream contract. */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The live omp agent bridge: transport lifecycle (`useOmpAgentStream`) and the
 * RPC command surface (`useOmpAgent`).
 *
 * What each case pins is a way the bridge could lie to the timeline:
 * - the transport is chosen from the setting and dials the right endpoint, and
 *   every decoded frame reaches the shared fold (`agent_start` must flip
 *   `isGenerating`) — a socket that opens but drops frames looks "connected"
 *   while the timeline sits still;
 * - reconnecting must CLOSE the previous socket and detach its handlers, or a
 *   late close from the stale socket flips the navbar to disconnected mid-run;
 * - the reload probe may only reattach when the server says the run is live
 *   (`running` + streaming/prompt-running/busy); reattaching on a finished
 *   session loops refusals, and skipping it freezes an in-flight response;
 * - pending ask/approval dialogs remembered by the server must be replayed or
 *   the run hangs with no modal;
 * - every command posts the exact RPC body (`follow_up`, `abort_and_prompt`,
 *   `set_model`, `set_thinking_level`, `extension_ui_response`) and a failed
 *   interrupt must release the guard that keeps the run alive.
 *
 * The WebSocket/EventSource constructors are stubbed; no real network is used.
 */

import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import { useOmpAgent } from '@/client/hooks/chat/omp/index';
import { readAgentStreamStatus } from '@/shared/lib/chat/omp/status';
import type { ChatMessageData, OmpAgentCallbacks, OmpAgentEvent, OmpAgentHandle, StreamTransport } from '@/shared/types';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent', 'WebSocket', 'EventSource'] as const;
/** The runner's own globals, restored on teardown (see the matching afterAll at the end of this file) so later files still see native Event/CustomEvent/window. */
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

let container: HTMLElement;

/** Minimal WebSocket double: records instances and lets a test drive events. */
class StubSocket {
  static latest: StubSocket[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: unknown = null;

  constructor(url: string) {
    this.url = url;
    StubSocket.latest.push(this);
  }

  close() { this.closed = true; }
  open() { this.onopen?.(); }
  frame(data: OmpAgentEvent) { this.onmessage?.({ data: JSON.stringify(data) }); }
  drop() { this.onclose?.(); }
}

class StubEventSource {
  static latest: StubEventSource[] = [];
  static CLOSED = 2;
  static readonly instances: StubEventSource[] = StubEventSource.latest;
  url: string;
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    StubEventSource.latest.push(this);
  }

  close() { this.closed = true; }
  open() { this.readyState = 1; this.onopen?.(); }
  frame(data: OmpAgentEvent) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
  target.WebSocket = StubSocket;
  target.EventSource = StubEventSource;
});

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  StubSocket.latest = [];
  StubEventSource.latest = [];
});

function mount(vnode: Parameters<typeof render>[0]) {
  container ??= document.body.appendChild(document.createElement('div'));
  return act(async () => { render(vnode, container as HTMLElement); });
}

interface StubCall { url: string; method: string; body: Record<string, unknown>; }

function stubFetch(answers: Record<string, unknown>) {
  const calls: StubCall[] = [];
  (globalThis as unknown as Record<string, unknown>).fetch = async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : {} });
    const answer = answers[url];
    if (answer === undefined) return new Response('{}', { status: 200 });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

function mountAgent(sessionId: string | null, callbacks: OmpAgentCallbacks = {}, transport: StreamTransport = 'websocket') {
  const seen: { handle: OmpAgentHandle | null } = { handle: null };

  function Probe({ id }: { id: string | null }) {
    seen.handle = useOmpAgent(id, callbacks, transport);
    return null;
  }

  return {
    mount: () => mount(h(Probe, { id: sessionId })),
    rerender: (id: string | null) => act(async () => { render(h(Probe, { id }), container as HTMLElement); }),
    handle: () => seen.handle as OmpAgentHandle,
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}


describe('useOmpAgent reload probe', () => {
  test('does nothing without a session', async () => {
    const calls = stubFetch({});
    await mountAgent(null).mount();
    await settle();
    expect(calls.length).toBe(0);
    expect(StubSocket.latest.length).toBe(0);
  });

  test('a finished session is not reattached', async () => {
    stubFetch({ '/api/agent/s1': { running: false, state: { isStreaming: false } } });
    let resumed = 0;
    const probe = mountAgent('s1', { onResumeStream: () => { resumed += 1; } });
    await probe.mount();
    await settle();
    expect(StubSocket.latest.length).toBe(0);
    expect(resumed).toBe(0);
  });

  test('a live run reattaches and replays pending dialogs', async () => {
    const requests = [{ id: 'ui-1', method: 'ask', question: 'ok?' }];
    stubFetch({ '/api/agent/s1': { running: true, state: { isPromptRunning: true }, pendingUiRequests: requests } });
    let resumed = 0;
    const dialogs: unknown[] = [];
    const probe = mountAgent('s1', {
      onResumeStream: () => { resumed += 1; },
      onExtensionUiRequest: (request) => { dialogs.push(request); },
    });
    await probe.mount();
    await settle();

    expect(StubSocket.latest.length).toBe(1);
    expect(StubSocket.latest[0].url).toBe('ws://localhost/api/agent/s1/ws');
    expect(resumed).toBe(1);
    expect(dialogs).toEqual(requests);
  });

  test('a locally-busy answer also reattaches', async () => {
    stubFetch({ '/api/agent/s1': { running: true, busy: true } });
    let resumed = 0;
    const probe = mountAgent('s1', { onResumeStream: () => { resumed += 1; } });
    await probe.mount();
    await settle();
    expect(StubSocket.latest.length).toBe(1);
    expect(resumed).toBe(1);
  });

  test('a session switch drops the previous run pending tool results', async () => {
    stubFetch({
      '/api/agent/s1': { running: true, busy: true },
      '/api/agent/s2': { running: true, busy: true },
    });
    const ended: ChatMessageData[] = [];
    const probe = mountAgent('s1', { onMessageEnd: (msg) => { ended.push(msg); } });
    await probe.mount();
    await settle();

    const first = StubSocket.latest[StubSocket.latest.length - 1];
    // A result lands for a call whose assistant message has not settled yet —
    // the map holds it until a `message_end` pairs it onto the tool call.
    await act(async () => {
      first.frame({ type: 'tool_execution_end', toolCallId: 'call-1', result: 'stale output' } as unknown as OmpAgentEvent);
    });
    await act(async () => {
      first.frame({
        type: 'message_end',
        message: {
          id: 'm1',
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'ls' } }],
        },
      } as unknown as OmpAgentEvent);
    });
    expect(ended.at(-1)?.toolCalls?.[0].output).toBe('stale output');

    // Switching sessions clears that map, so the NEW session's own tool call —
    // same id, different run — must not inherit the previous run's output.
    await probe.rerender('s2');
    await settle();
    const second = StubSocket.latest[StubSocket.latest.length - 1];
    expect(second).not.toBe(first);
    await act(async () => {
      second.frame({
        type: 'message_end',
        message: {
          id: 'm2',
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'ls' } }],
        },
      } as unknown as OmpAgentEvent);
    });
    expect(ended.length).toBe(2);
    expect(ended.at(-1)?.toolCalls?.[0].output).toBeUndefined();
  });

  test('the probe is a plain GET of the session route', async () => {
    const calls = stubFetch({ '/api/agent/s1': { running: false } });
    const probe = mountAgent('s1');
    await probe.mount();
    await settle();
    expect(calls).toEqual([{ url: '/api/agent/s1', method: 'GET', body: {} }]);
  });

  test('unmount disconnects the live socket', async () => {
    stubFetch({ '/api/agent/s1': { running: true, busy: true } });
    const probe = mountAgent('s1');
    await probe.mount();
    await settle();
    await act(async () => { StubSocket.latest[0].open(); });
    expect(StubSocket.latest[0].closed).toBe(false);

    render(null, container as HTMLElement);
    expect(StubSocket.latest[0].closed).toBe(true);
    expect(readAgentStreamStatus()).toEqual({ transport: 'websocket', connected: false });
  });
});
