/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared harness for the queue-delivery tests — `delivery.server.test.ts`
 * (scheduling, retry, wedge recovery) and `delivery-dispatch.server.test.ts`
 * (what a dispatch sends, and the timer-free nudge).
 *
 * The store mock is registered HERE, exactly once. `mock.module` swaps a
 * registry entry that `delivery.server.ts` resolves at import time, so a second
 * registration in another test file would leave one file's tests driving a
 * queue map the other file asserts against — a split that passes or fails by
 * file order. The in-memory queue below is that shared map; per-test isolation
 * comes from `beginQueueTest`'s unique session id, not from a fresh module.
 *
 * Time is fake: every test drives the clock explicitly, so nothing here waits
 * on the wall clock.
 */

import { jest, mock } from 'bun:test';
import type { QueuedMessage } from '@/shared/types/chat';
import type { QueueDeliveryHost } from '@/server/lib/queue/delivery.server';

/** In-memory stand-in for the SQLite-backed queue. */
export const queue = new Map<string, QueuedMessage[]>();

mock.module('@/server/lib/queue/store.server', () => ({
  claimHeadQueueItem: async (sessionId: string): Promise<QueuedMessage | null> => {
    const items = queue.get(sessionId);
    return items?.shift() ?? null;
  },
  hasQueuedItem: async (sessionId: string): Promise<boolean> => (queue.get(sessionId)?.length ?? 0) > 0,
  requeueHeadQueueItem: async (sessionId: string, item: QueuedMessage): Promise<void> => {
    const items = queue.get(sessionId) ?? [];
    items.unshift(item);
    queue.set(sessionId, items);
  },
}));

// Dynamic import is load-bearing: the module must be evaluated AFTER the
// `mock.module` call above, so its store bindings resolve to the mock. A static
// import is hoisted above the registration and would bind the real SQLite store.
export const { deliverQueueNow, scheduleQueueDelivery } = await import('@/server/lib/queue/delivery.server');

export const MODEL = { provider: 'kenari', modelId: 'deepseek-v4-pro', thinkingLevel: 'max', accessMode: 'yolo' as const };

export function queueItem(text: string, model: QueuedMessage['model'] = MODEL): QueuedMessage {
  return { id: `item-${text}`, text, attachments: [], model };
}

/** Records the RPCs a delivery pushes at the session. */
export function makeHost(sessionId: string): { host: QueueDeliveryHost; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const host: QueueDeliveryHost = {
    sessionId,
    isAlive: () => true,
    isBusy: () => false,
    send: async (command) => {
      sent.push(command);
      return {};
    },
  };
  return { host, sent };
}

/** Let the delivery's promise chain settle without advancing the clock. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

let counter = 0;

/** Per-test setup: an empty queue, fake timers, and a session id of its own. */
export function beginQueueTest(): string {
  const sessionId = `queue-test-${counter++}`;
  queue.clear();
  jest.useFakeTimers();
  return sessionId;
}

/** One scheduled delivery, past the 500ms settle delay and settled. */
export async function settleDelivery(host: QueueDeliveryHost): Promise<void> {
  scheduleQueueDelivery(host);
  jest.advanceTimersByTime(600);
  await flush();
}
