/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression test for the observer WebSocket routes' connection state.
 *
 * The bug this pins: `agent/ws.ts` and `btw/ws.ts` kept per-connection state in
 * a `WeakMap` keyed by the `ws` object. Elysia's Bun adapter builds a NEW
 * `ElysiaWS` wrapper for every callback and hands `pong` the RAW socket, so
 * every lookup missed — the pong never cleared `awaitingPong`, the second
 * heartbeat tore down a socket the client was still reading, and `close` leaked
 * the interval and the session subscription for the life of the process.
 *
 * These assertions run through a real listener on purpose: the failure lived in
 * the framework's callback identity, which a unit-level fake of `ws` cannot
 * reproduce. That also makes the heartbeat a REAL timer here — the property
 * under test is "the socket outlives N keepalive cycles", so the clock is the
 * thing being measured. The interval is shrunk to 60ms to keep it cheap.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';

/** Heartbeat for the test — several beats must fit inside a test timeout. */
const HEARTBEAT_MS = 60;

// The route reads the cadence constant at module scope, so the module is
// replaced BEFORE the route module is imported.
mock.module('@/shared/lib/workspace/refresh-cadence', () => ({
  STREAM_HEARTBEAT_MS: HEARTBEAT_MS,
  SIDEBAR_IDLE_REFRESH_MS: 30_000,
  SIDEBAR_STREAM_POLL_MS: 8_000,
  SIDEBAR_REVALIDATE_THROTTLE_MS: 1_000,
  PANEL_REFRESH_MS: 5_000,
  FILE_MUTATION_THROTTLE_MS: 500,
  GIT_STATUS_POLL_MS: 15_000,
  GIT_STATUS_EVENT_THROTTLE_MS: 1_000,
  REPO_DISCOVERY_POLL_MS: 1_500,
  TODO_REFRESH_EVENT_THROTTLE_MS: 400,
  BROWSER_POLL_MS: 1_000,
  SIDEBAR_DATA_TTL_MS: 4_000,
  SESSION_META_RETRY_SCHEDULE_MS: [250],
}));

const { agentWsRoutes } = await import('@/server/routes/agent/ws');

/** The live session the route subscribes to; records its own lifecycle. */
interface SessionStub {
  isAlive: () => boolean;
  onEvent: (listener: (event: unknown) => void) => () => void;
  listeners: Set<(event: unknown) => void>;
  unsubscribes: number;
}

function makeSession(): SessionStub {
  const stub: SessionStub = {
    isAlive: () => true,
    listeners: new Set(),
    unsubscribes: 0,
    onEvent(listener) {
      stub.listeners.add(listener);
      return () => {
        stub.unsubscribes += 1;
        stub.listeners.delete(listener);
      };
    },
  };
  return stub;
}

let session = makeSession();
const app = new Elysia().use(agentWsRoutes);
let baseUrl = '';

beforeAll(async () => {
  (globalThis as { __ompSessions?: unknown }).__ompSessions = {
    get: (id: string) => (id === 'test-session' ? session : undefined),
  };
  await app.listen({ port: 0, hostname: '127.0.0.1' });
  const port = (app.server as { port?: number } | null)?.port;
  if (!port) throw new Error('test listener did not report a port');
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.stop();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One client, its received frames, and the promises for its lifecycle. */
function connect(sessionId: string) {
  const frames: unknown[] = [];
  const client = new WebSocket(`${baseUrl}/api/agent/${sessionId}/ws`);
  const opened = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<number>();
  client.onopen = () => opened.resolve();
  client.onmessage = (event) => {
    try {
      frames.push(JSON.parse(String(event.data)));
    } catch {
      // A non-JSON frame would be a protocol bug; assertions read `frames`.
    }
  };
  client.onclose = (event) => closed.resolve(event.code);
  return { client, frames, opened: opened.promise, closed: closed.promise };
}

describe('agent observer WebSocket', () => {
  test('survives many heartbeats instead of being torn down by its own keepalive', async () => {
    session = makeSession();
    const { client, closed } = connect('test-session');
    // Five beats: the old code closed the socket at the second one.
    await sleep(HEARTBEAT_MS * 5);
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
    await closed;
  });

  test('delivers the connected greeting and live session frames', async () => {
    session = makeSession();
    const { client, frames, opened, closed } = connect('test-session');
    await opened;
    for (const listener of session.listeners) listener({ type: 'agent_start' });
    await sleep(30);
    expect(frames).toEqual([
      { type: 'connected', sessionId: 'test-session' },
      { type: 'agent_start' },
    ]);
    client.close();
    await closed;
  });

  test('releases the session subscription when the client disconnects', async () => {
    session = makeSession();
    const { client, opened, closed } = connect('test-session');
    await opened;
    expect(session.listeners.size).toBe(1);
    client.close();
    await closed;
    await sleep(30);
    expect(session.unsubscribes).toBe(1);
    expect(session.listeners.size).toBe(0);
  });

  test('refuses a session the chamber does not manage', async () => {
    const { opened, closed, client } = connect('unknown-session');
    const outcome = await Promise.race([
      opened.then(() => 'opened' as const),
      closed.then(() => 'closed' as const),
      sleep(400).then(() => 'timeout' as const),
    ]);
    // The upgrade is rejected before `open` runs, so the client never opens.
    expect(outcome).not.toBe('opened');
    client.close();
  });
});
