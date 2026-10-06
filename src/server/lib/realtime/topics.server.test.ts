/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `publishTopic` must re-resolve through the descriptor the HUB was registered
 * with.
 *
 * The failure this pins is silent in production and total: the publisher used
 * its own module-level descriptor table, which holds only the exact-name
 * topics. A scoped name (`git:<root>\0<repo>`, `fs:`, `repos:`, `wiki:`) is not
 * in that table, so the lookup returned `null` and every subscriber's panel was
 * BLANKED by a `delta null` instead of re-read — while the resolver that should
 * have run never did. The same lookup also bypassed the registered table
 * entirely, which is why a test with its own topic set saw the production
 * resolver run.
 */

import { afterEach, describe, expect, test, vi } from 'bun:test';

import { getRealtimeHub, registerTopics, resetRealtimeHub, type RealtimeConnection } from '@/server/lib/realtime/hub.server';
import { publishTopic } from '@/server/lib/realtime/topics.server';
import { gitTopic, type RealtimeServerFrame } from '@/shared/lib/realtime/protocol';

interface FakeConnection extends RealtimeConnection {
  frames: RealtimeServerFrame[];
}

function connect(): FakeConnection {
  const connection: FakeConnection = {
    topics: new Set<string>(),
    snapshotted: new Set<string>(),
    closed: false,
    frames: [],
    send: (frame) => {
      connection.frames.push(frame);
    },
  };
  return connection;
}

/**
 * Run the publisher's coalescing window and then drain the resolve's microtask
 * chain. Deterministic: the clock is advanced, not waited on.
 */
async function flushPublish(): Promise<void> {
  vi.advanceTimersByTime(200);
  for (let tick = 0; tick < 32; tick += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  resetRealtimeHub();
  // The dedupe/coalesce state is process state too; a payload identical to the
  // previous test's would otherwise be skipped as a no-op publish.
  globalThis.__ompChamberRealtimePublish = undefined;
});

describe('publishTopic', () => {
  test('a scoped topic is re-resolved and its subscribers get the new value', async () => {
    vi.useFakeTimers();
    const topic = gitTopic('/ws\u0000.');
    let changes = 1;
    registerTopics(new Map([[topic, { resolve: async () => ({ changes }) }]]));

    const hub = getRealtimeHub();
    const connection = connect();
    hub.subscribe(connection, topic);
    for (let tick = 0; tick < 32; tick += 1) await Promise.resolve();
    expect(connection.frames).toHaveLength(1);

    changes = 3;
    connection.frames.length = 0;
    publishTopic(topic);
    await flushPublish();

    // A DELTA carrying the fresh payload — not `null`, which is what the
    // module-local lookup produced for a name it did not hold.
    expect(connection.frames).toEqual([
      { t: 'delta', topic, seq: 1, payload: { changes: 3 } },
    ]);
  });

  test('the registered resolver is the one called, not a module-local copy', async () => {
    vi.useFakeTimers();
    const topic = gitTopic('/ws\u0000.');
    let calls = 0;
    registerTopics(new Map([[topic, { resolve: async () => { calls += 1; return { marker: 'registered' }; } }]]));

    const hub = getRealtimeHub();
    const connection = connect();
    hub.subscribe(connection, topic);
    for (let tick = 0; tick < 32; tick += 1) await Promise.resolve();

    connection.frames.length = 0;
    publishTopic(topic);
    await flushPublish();

    expect(calls).toBe(2);
    expect(connection.frames[0]).toMatchObject({ t: 'delta', payload: { marker: 'registered' } });
  });
});
