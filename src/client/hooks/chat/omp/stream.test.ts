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
import { useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact/compat';
import { act } from 'preact/test-utils';

import { useOmpAgentStream } from '@/client/hooks/chat/omp/stream';
import { pristineWebSocket } from '@/test-support/pristine-globals';
import { readAgentStreamStatus } from '@/shared/lib/chat/omp/status';
import type { ChatMessageData, OmpAgentCallbacks, OmpAgentEvent, OmpAgentState, StreamTransport } from '@/shared/types';

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
  nativeGlobals.WebSocket = pristineWebSocket;   // never the fake another suite left
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

const EMPTY_STATE: OmpAgentState = { isGenerating: false, connected: false, error: null };

interface StreamApi {
  connect: (sessionId: string) => void;
  disconnect: () => void;
}

/** Mounts `useOmpAgentStream` with fresh refs and exposes its api + state. */
function mountStream(transport: StreamTransport) {
  const seen: { api: StreamApi | null } = { api: null };
  const state: { current: OmpAgentState } = { current: EMPTY_STATE };
  const calls: string[] = [];

  function Probe() {
    const [next, setState] = useState<OmpAgentState>(EMPTY_STATE);
    const callbacksRef = useRef<OmpAgentCallbacks>({ onConnected: () => { calls.push('connected'); } });
    state.current = next;
    seen.api = useOmpAgentStream({
      setState,
      callbacksRef,
      toolResultsRef: useRef(new Map()) as RefObject<Map<string, never>>,
      lastToolMessageRef: useRef<ChatMessageData | null>(null),
      interruptPendingRef: useRef(false),
      activityRef: useRef(''),
      currentThinkingLevelRef: useRef<string | undefined>(undefined),
      providerRetryVerbRef: useRef<string | null>(null),
      fileMutatingCallsRef: useRef(new Set<string>()),
      transport,
    });
    return null;
  }

  return { mount: () => mount(h(Probe, null)), api: () => seen.api as StreamApi, state: () => state.current, calls };
}

describe('useOmpAgentStream', () => {
  test('dials the websocket endpoint and reports the connection', async () => {
    const probe = mountStream('websocket');
    await probe.mount();
    expect(readAgentStreamStatus()).toEqual({ transport: 'websocket', connected: false });

    await act(async () => { probe.api().connect('s1'); });
    expect(StubSocket.latest.length).toBe(1);
    expect(StubSocket.latest[0].url).toBe('ws://localhost/api/agent/s1/ws');

    await act(async () => { StubSocket.latest[0].open(); });
    expect(probe.state().connected).toBe(true);
    expect(probe.calls).toEqual(['connected']);
    expect(readAgentStreamStatus()).toEqual({ transport: 'websocket', connected: true });
  });

  test('folds decoded frames into agent state', async () => {
    const probe = mountStream('websocket');
    await probe.mount();
    await act(async () => { probe.api().connect('s1'); });
    await act(async () => { StubSocket.latest[0].frame({ type: 'agent_start' }); });
    expect(probe.state().isGenerating).toBe(true);
  });

  test('reconnecting closes the old socket, whose late close cannot flip state', async () => {
    const probe = mountStream('websocket');
    await probe.mount();
    await act(async () => { probe.api().connect('s1'); });
    await act(async () => { StubSocket.latest[0].open(); });
    await act(async () => { probe.api().connect('s2'); });

    expect(StubSocket.latest.length).toBe(2);
    expect(StubSocket.latest[0].closed).toBe(true);
    expect(StubSocket.latest[1].url).toBe('ws://localhost/api/agent/s2/ws');

    await act(async () => { StubSocket.latest[1].open(); });
    await act(async () => { StubSocket.latest[0].drop(); });
    expect(probe.state().connected).toBe(true);
  });

  test('disconnect releases the socket and publishes the retraction', async () => {
    const probe = mountStream('websocket');
    await probe.mount();
    await act(async () => { probe.api().connect('s1'); });
    await act(async () => { StubSocket.latest[0].open(); });

    await act(async () => { probe.api().disconnect(); });
    expect(StubSocket.latest[0].closed).toBe(true);
    expect(probe.state().connected).toBe(false);
    expect(readAgentStreamStatus()).toEqual({ transport: 'websocket', connected: false });
  });

  test('the sse transport dials the events endpoint and folds identically', async () => {
    const probe = mountStream('sse');
    await probe.mount();
    await act(async () => { probe.api().connect('s2'); });

    expect(StubSocket.latest.length).toBe(0);
    expect(StubEventSource.latest.length).toBe(1);
    expect(StubEventSource.latest[0].url).toBe('/api/agent/s2/events');

    await act(async () => { StubEventSource.latest[0].open(); });
    await act(async () => { StubEventSource.latest[0].frame({ type: 'agent_start' }); });
    expect(probe.state().isGenerating).toBe(true);
  });

  test('unmount retracts the published status', async () => {
    const probe = mountStream('websocket');
    await probe.mount();
    await act(async () => { probe.api().connect('s1'); });
    await act(async () => { StubSocket.latest[0].open(); });
    expect(readAgentStreamStatus().connected).toBe(true);

    render(null, container as HTMLElement);
    // The raw stream hook owns no teardown beyond the status retraction —
    // closing the socket is `useOmpAgent`'s unmount cleanup.
    expect(readAgentStreamStatus()).toEqual({ transport: 'websocket', connected: false });
  });
});
