/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The transport layer is the one place a session id is turned into a wire URL
 * and a socket/EventSource into the timeline's frame callbacks. A wrong URL
 * 404s the stream, a mis-encoded id dials another session, and a reconnect that
 * spins on a refused handshake floods the server — so these tests pin the URL
 * shapes for both the agent and BTW paths, the transport selection rule, the
 * capped reconnect backoff, and the "refused first dial is terminal" contract
 * the socket shares with the SSE route's observer-only rule.
 *
 * WebSocket/EventSource/timers are stubbed: no live server, no real waits.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  DEFAULT_STREAM_TRANSPORT,
  agentEventsUrl,
  agentSocketUrl,
  btwEventsUrl,
  btwSocketUrl,
  readStreamTransport,
} from '@/shared/lib/chat/omp/transport';
import { connectAgentEvents, connectEvents } from '@/shared/lib/chat/omp/sse';
import { pristineWebSocket } from '@/test-support/pristine-globals';
import { connectAgentSocket, connectSocket } from '@/shared/lib/chat/omp/socket';
import { primeChamberSettings } from '@/shared/lib/settings/client';

// ---------------------------------------------------------------------------
// URL builders + transport selection (no globals needed beyond `window.location`)
// ---------------------------------------------------------------------------

const realWindow = (globalThis as Record<string, unknown>).window;

function fakeLocation(protocol: string, host: string): void {
  (globalThis as Record<string, unknown>).window = { location: { protocol, host } };
}

afterEach(() => {
  (globalThis as Record<string, unknown>).window = realWindow;
});

/**
 * The settings snapshot is module state shared by every suite in one
 * `bun test` process, and the last case here leaves it primed with `sse`.
 * Restore the pristine (unprimed) snapshot so a later file that reads the
 * configured transport — `status.ts` seeds its default at import — sees the
 * default rather than this suite's last fixture.
 */
afterAll(() => {
  primeChamberSettings({});
});

describe('agent + btw URL builders', () => {
  test('socket URL switches ws/wss on the page protocol and encodes the id', () => {
    fakeLocation('http:', 'localhost:5173');
    expect(agentSocketUrl('abc')).toBe('ws://localhost:5173/api/agent/abc/ws');
    expect(agentSocketUrl('a b/c')).toBe('ws://localhost:5173/api/agent/a%20b%2Fc/ws');
    expect(btwSocketUrl('abc')).toBe('ws://localhost:5173/api/btw/abc/ws');

    fakeLocation('https:', 'chamber.example');
    expect(agentSocketUrl('abc')).toBe('wss://chamber.example/api/agent/abc/ws');
    expect(btwSocketUrl('a/b')).toBe('wss://chamber.example/api/btw/a%2Fb/ws');
  });

  test('events URLs are same-origin paths, not absolute', () => {
    expect(agentEventsUrl('abc')).toBe('/api/agent/abc/events');
    expect(agentEventsUrl('a b')).toBe('/api/agent/a%20b/events');
    expect(btwEventsUrl('abc')).toBe('/api/btw/abc/events');
  });
});

describe('readStreamTransport', () => {
  test('defaults to websocket when unset, and for an unknown value', () => {
    primeChamberSettings({});
    expect(readStreamTransport()).toBe(DEFAULT_STREAM_TRANSPORT);
    expect(DEFAULT_STREAM_TRANSPORT).toBe('websocket');

    primeChamberSettings({ streamTransport: 'quic' });
    expect(readStreamTransport()).toBe('websocket');
  });

  test('honours an explicit sse/websocket choice from the flat map and the blob', () => {
    primeChamberSettings({ streamTransport: 'sse' });
    expect(readStreamTransport()).toBe('sse');

    primeChamberSettings({ omp_chamber_settings: { streamTransport: 'websocket' } });
    expect(readStreamTransport()).toBe('websocket');

    primeChamberSettings({ omp_chamber_settings: { streamTransport: 'sse' } });
    expect(readStreamTransport()).toBe('sse');
  });
});

// ---------------------------------------------------------------------------
// WebSocket connector: reconnect with capped backoff, terminal first dial
// ---------------------------------------------------------------------------

interface Dial {
  url: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  closed: boolean;
}

class FakeWebSocket {
  static instances: Dial[] = [];
  url: string;
  onopen: Dial['onopen'] = null;
  onmessage: Dial['onmessage'] = null;
  onclose: Dial['onclose'] = null;
  onerror: Dial['onerror'] = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this as unknown as Dial);
  }

  close(): void {
    this.closed = true;
  }
}

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realWebSocket = pristineWebSocket;

let timers: { fn: () => void; ms: number }[];

beforeEach(() => {
  timers = [];
  FakeWebSocket.instances = [];
  (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    timers.push({ fn, ms: ms ?? 0 });
    return timers.length;
  }) as unknown as typeof globalThis.setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
});

afterEach(() => {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  (globalThis as Record<string, unknown>).WebSocket = realWebSocket;
});

function connect() {
  const frames: unknown[] = [];
  const opens: number[] = [];
  const closes: number[] = [];
  const connection = connectSocket('ws://x/api/agent/s/ws', {
    onOpen: () => opens.push(1),
    onFrame: (f) => frames.push(f),
    onClose: () => closes.push(1),
  });
  return { connection, frames, opens, closes };
}

describe('connectSocket', () => {
  test('a socket that closes before opening is terminal — no re-dial', () => {
    const { frames, opens, closes } = connect();
    expect(FakeWebSocket.instances.length).toBe(1);

    FakeWebSocket.instances[0].onclose?.();

    expect(closes.length).toBe(1);
    expect(opens.length).toBe(0);
    expect(timers.length).toBe(0);
    expect(frames.length).toBe(0);
  });

  test('decodes JSON frames and drops malformed ones', () => {
    const { frames, opens } = connect();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    expect(opens.length).toBe(1);

    ws.onmessage?.({ data: '{"type":"agent_start"}' });
    ws.onmessage?.({ data: 'not json' });
    ws.onmessage?.({ data: '{"type":"agent_end"}' });

    expect(frames).toEqual([{ type: 'agent_start' }, { type: 'agent_end' }]);
  });

  test('re-dials an established stream after a drop, with doubling backoff capped at 8s', () => {
    const { closes } = connect();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onclose?.();

    expect(closes.length).toBe(1);
    expect(timers.map((t) => t.ms)).toEqual([500]);

    // Each re-dial never opens, so the failures counter is what advances the backoff.
    for (let i = 0; i < 4; i += 1) {
      timers[timers.length - 1].fn();
      const dialed = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
      dialed.onclose?.();
    }

    expect(FakeWebSocket.instances.map((ws) => ws.url)).toEqual(Array(5).fill('ws://x/api/agent/s/ws'));
    expect(timers.map((t) => t.ms)).toEqual([500, 1_000, 2_000, 4_000]);
    expect(closes.length).toBe(5);
  });

  test('close() releases the live socket and suppresses further callbacks', () => {
    const { connection, frames } = connect();
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();

    connection.close();

    expect(ws.closed).toBe(true);
    expect(ws.onopen).toBe(null);
    expect(ws.onmessage).toBe(null);
    expect(ws.onclose).toBe(null);

    // A late message after release is ignored.
    ws.onmessage?.({ data: '{"type":"late"}' });
    expect(frames.length).toBe(0);
  });

  test('close() cancels the pending re-dial so a released stream never reconnects', () => {
    const { connection, closes } = connect();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onclose?.();
    expect(timers.length).toBe(1);

    connection.close();
    // Even if the queued retry fires after release, it must not dial again.
    timers[0].fn();

    expect(FakeWebSocket.instances.length).toBe(1);
    expect(closes.length).toBe(1);
  });

  test('connectAgentSocket dials the agent ws URL for the session', () => {
    fakeLocation('http:', 'localhost:5173');
    connectAgentSocket('s1', { onOpen: () => {}, onFrame: () => {}, onClose: () => {} });
    expect(FakeWebSocket.instances[0].url).toBe('ws://localhost:5173/api/agent/s1/ws');
  });
});

// ---------------------------------------------------------------------------
// SSE connector: browser owns reconnection; only a fatal close is reported
// ---------------------------------------------------------------------------

interface Source {
  url: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  closed: boolean;
}

class FakeEventSource {
  static instances: Source[] = [];
  static readonly CLOSED = 2;
  static readonly OPEN = 1;
  url: string;
  onopen: Source['onopen'] = null;
  onmessage: Source['onmessage'] = null;
  onerror: Source['onerror'] = null;
  readyState = FakeEventSource.OPEN;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this as unknown as Source);
  }

  close(): void {
    this.closed = true;
  }
}

const realEventSource = (globalThis as Record<string, unknown>).EventSource;

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as Record<string, unknown>).EventSource = FakeEventSource;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).EventSource = realEventSource;
});

describe('connectEvents', () => {
  test('forwards open + JSON frames and ignores malformed payloads', () => {
    const frames: unknown[] = [];
    const opens: number[] = [];
    connectEvents<{ n: number }>('/api/agent/s/events', {
      onOpen: () => opens.push(1),
      onFrame: (f) => frames.push(f),
      onClose: () => {},
    });
    const source = FakeEventSource.instances[0];
    source.onopen?.();
    source.onmessage?.({ data: '{"n":1}' });
    source.onmessage?.({ data: '<html>' });

    expect(opens.length).toBe(1);
    expect(frames).toEqual([{ n: 1 }]);
  });

  test('reports close only on a fatal (CLOSED) error', () => {
    const closes: number[] = [];
    connectEvents('/api/agent/s/events', { onOpen: () => {}, onFrame: () => {}, onClose: () => closes.push(1) });
    const source = FakeEventSource.instances[0];

    source.readyState = FakeEventSource.OPEN;
    source.onerror?.();
    expect(closes.length).toBe(0);

    source.readyState = FakeEventSource.CLOSED;
    source.onerror?.();
    expect(closes.length).toBe(1);
  });

  test('close() tears the source down and detaches every handler', () => {
    const frames: unknown[] = [];
    const connection = connectEvents('/api/agent/s/events', {
      onOpen: () => {},
      onFrame: (f) => frames.push(f),
      onClose: () => {},
    });
    const source = FakeEventSource.instances[0];
    connection.close();

    expect(source.closed).toBe(true);
    expect(source.onopen).toBe(null);
    expect(source.onmessage).toBe(null);
    expect(source.onerror).toBe(null);
  });

  test('connectAgentEvents dials the agent events URL for the session', () => {
    connectAgentEvents('s 1', { onOpen: () => {}, onFrame: () => {}, onClose: () => {} });
    expect(FakeEventSource.instances[0].url).toBe('/api/agent/s%201/events');
  });
});
