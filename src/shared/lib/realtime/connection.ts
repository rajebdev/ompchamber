/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The socket lifecycle for the unified realtime channel: one connection per
 * tab, its backoff, and its status.
 *
 * Split from `client.ts` (which owns topic state) so each file stays about one
 * concern. This one knows nothing about topics beyond "subscribe these names on
 * open" and "hand every inbound frame to the sink"; the topic bookkeeping —
 * sequence tracking, gap detection, snapshots — lives there.
 *
 * ## Why a dial needs a timeout
 *
 * A dial is not guaranteed to end. Measured: a socket can sit in CONNECTING
 * with no `open`, `error` or `close` at all (a listener that has bound but is
 * not accepting, or a proxy that swallows the upgrade). Backoff is driven by
 * `close`, so without an explicit deadline the channel would sit dead forever
 * while the tab reports "connecting".
 *
 * State lives on `globalThis` so a dev HMR re-evaluation adopts the live socket
 * instead of opening a second one against the same server.
 */

import {
  encodeClientFrame,
  realtimeSocketUrl,
  type RealtimeClientFrame,
} from '@/shared/lib/realtime/protocol';

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;
/** Consecutive re-dials that never opened before the channel is given up on. */
const MAX_FAILED_DIALS = 4;
/** How long a dial may sit in CONNECTING before it is abandoned and retried. */
const CONNECT_TIMEOUT_MS = 10_000;

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

/** The topics that should be subscribed once the socket is open. */
export type LiveTopicSource = () => string[];

/** Every inbound frame, as raw text, handed to the topic layer. */
export type FrameSink = (raw: string) => void;

interface ConnectionState {
  socket: WebSocket | null;
  status: RealtimeStatus;
  statusListeners: Set<() => void>;
  /** Browser timer handle (`window.setTimeout`), so `clearTimeout` accepts it. */
  retryTimer: number | undefined;
  failures: number;
  /** A dial is wanted (someone is subscribed) but none is in flight. */
  wanted: boolean;
  /**
   * Socket constructor override, for a test that drives the channel through a
   * real listener. The default reads the global, which is what production
   * wants — but a test process shares that global with every other suite, so a
   * suite that stubs `WebSocket` would otherwise leave this client dialing a
   * stub that never opens.
   */
  socketCtor: typeof WebSocket | null;
}

/**
 * The topic layer's hooks, wired ONCE at import.
 *
 * Module scope rather than the resettable state object: a test teardown clears
 * the socket and its timers, and if these lived there too the client would come
 * back with no frame sink — every subsequent connection would open and silently
 * drop every frame.
 */
let frameSink: FrameSink | null = null;
let liveTopicSource: LiveTopicSource | null = null;
let closeHook: (() => void) | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberRealtimeConnection: ConnectionState | undefined;
}

function state(): ConnectionState {
  return (globalThis.__ompChamberRealtimeConnection ??= {
    socket: null,
    status: 'idle',
    statusListeners: new Set(),
    retryTimer: undefined,
    failures: 0,
    wanted: false,
    socketCtor: null,
  });
}

/** The topic layer registers itself here at import. */
export function configureConnection(
  sink: FrameSink,
  liveTopics: LiveTopicSource,
  onClose: () => void,
): void {
  frameSink = sink;
  liveTopicSource = liveTopics;
  closeHook = onClose;
}

/**
 * Override the socket constructor. Test-only: a suite driving the channel
 * through a real listener injects the runner's own `WebSocket`, so another
 * suite's stub cannot capture its dial.
 */
export function setSocketConstructor(ctor: typeof WebSocket | null): void {
  state().socketCtor = ctor;
}

export function setStatus(next: RealtimeStatus): void {
  const host = state();
  if (host.status === next) return;
  host.status = next;
  for (const listener of [...host.statusListeners]) listener();
}

export function currentStatus(): RealtimeStatus {
  return state().status;
}

export function onStatusChange(listener: () => void): () => void {
  const host = state();
  host.statusListeners.add(listener);
  return () => host.statusListeners.delete(listener);
}

/** Send one control frame. False when the socket is not open. */
export function send(frame: RealtimeClientFrame): boolean {
  const socket = state().socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(encodeClientFrame(frame));
    return true;
  } catch {
    return false;
  }
}

/** Whether a dial is wanted right now (someone has a subscription). */
export function setWanted(wanted: boolean): void {
  state().wanted = wanted;
}

function scheduleReconnect(): void {
  const host = state();
  if (!host.wanted || host.retryTimer !== undefined) return;
  if (host.failures >= MAX_FAILED_DIALS) {
    setStatus('error');
    return;
  }
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** host.failures, RECONNECT_MAX_MS);
  host.retryTimer = window.setTimeout(() => {
    host.retryTimer = undefined;
    dial();
  }, delay);
}

function dial(): void {
  const host = state();
  if (host.socket) return;
  if (typeof window === 'undefined') return;

  setStatus('connecting');
  const Ctor = host.socketCtor ?? WebSocket;
  let socket: WebSocket;
  try {
    socket = new Ctor(realtimeSocketUrl());
  } catch {
    host.failures += 1;
    scheduleReconnect();
    return;
  }
  host.socket = socket;
  let opened = false;

  // Abandon a dial that never settles. Closing it fires `onclose`, which owns
  // the retry decision — the same path a refused or dropped connection takes.
  const connectTimer = window.setTimeout(() => {
    if (opened || host.socket !== socket) return;
    try {
      socket.close();
    } catch {
      // Already gone.
    }
  }, CONNECT_TIMEOUT_MS);

  socket.onopen = () => {
    opened = true;
    clearTimeout(connectTimer);
    host.failures = 0;
    setStatus('open');
    // Resubscribe the live set: the server answers each with a fresh snapshot,
    // which is the repair for everything missed while the socket was down.
    const topics = liveTopicSource?.() ?? [];
    if (topics.length > 0) send({ t: 'subscribe', topics });
  };

  socket.onmessage = (event) => {
    if (typeof event.data === 'string') frameSink?.(event.data);
  };

  socket.onclose = () => {
    clearTimeout(connectTimer);
    host.socket = null;
    if (!opened) host.failures += 1;
    setStatus('closed');
    // Every value is now of unknown age; the resubscribe on reopen is the
    // repair, and this is what tells the UI to say so meanwhile.
    closeHook?.();
    scheduleReconnect();
  };

  socket.onerror = () => {
    // `onclose` always follows, and owns the retry decision.
  };
}

/** Open the socket when something wants it and nothing is dialing. */
export function connectIfNeeded(): void {
  const host = state();
  host.wanted = (liveTopicSource?.() ?? []).length > 0;
  if (!host.wanted) return;
  if (host.status === 'error') return;
  if (host.socket) return;
  if (host.retryTimer !== undefined) return;
  dial();
}

/** Test seam: close the socket and forget the connection state. */
export function resetConnection(): void {
  const host = state();
  clearTimeout(host.retryTimer);
  try {
    host.socket?.close();
  } catch {
    // Already gone.
  }
  globalThis.__ompChamberRealtimeConnection = undefined;
}
