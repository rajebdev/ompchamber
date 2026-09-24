/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The follow-up queue must never wedge.
 *
 * A scheduled delivery whose timer never runs (a `bun --hot` module
 * re-evaluation discards the pending closure; a wedged event loop drops the
 * callback) used to poison the session permanently: the in-flight guard
 * early-returned on the leftover entry, so no later trigger — another
 * agent_end, a tab's mount nudge — could ever schedule again. The queue simply
 * stopped draining, with no error anywhere. Observed live: a dev server whose
 * `setTimeout` from request handlers had stopped firing left every queued
 * follow-up stranded, while a freshly started server delivered the identical
 * item correctly.
 *
 * The store is mocked so the contract under test is delivery's own: which RPCs
 * a claimed item produces, and that a lost timer is superseded rather than
 * allowed to wedge the session. Time is driven by fake timers, so nothing here
 * waits on the wall clock.
 */

import { afterAll, afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';
import type { QueuedMessage } from '@/shared/types/chat';
import type { QueueDeliveryHost } from '@/server/lib/queue/delivery.server';

/** In-memory stand-in for the SQLite-backed queue. */
const queue = new Map<string, QueuedMessage[]>();

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

const { scheduleQueueDelivery, deliverQueueNow } = await import('@/server/lib/queue/delivery.server');

const MODEL = { provider: 'kenari', modelId: 'deepseek-v4-pro', thinkingLevel: 'max', accessMode: 'yolo' as const };

function queueItem(text: string, model: QueuedMessage['model'] = MODEL): QueuedMessage {
  return { id: `item-${text}`, text, attachments: [], model };
}

/** Records the RPCs a delivery pushes at the session. */
function makeHost(sessionId: string) {
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
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

let sessionId = '';
let counter = 0;

beforeEach(() => {
  sessionId = `queue-test-${counter++}`;
  queue.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  mock.restore();
});

describe('queue delivery', () => {
  test('delivers the head with the model snapshot it was queued with', async () => {
    queue.set(sessionId, [queueItem('queued hello')]);
    const { host, sent } = makeHost(sessionId);

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent).toEqual([
      { type: 'set_model', provider: 'kenari', modelId: 'deepseek-v4-pro' },
      { type: 'set_thinking_level', level: 'max' },
      { type: 'prompt', message: 'queued hello', accessMode: 'yolo' },
    ]);
    expect(queue.get(sessionId)).toEqual([]);
  });

  test("an 'auto' thinking level is left to the session", async () => {
    queue.set(sessionId, [queueItem('no level', { ...MODEL, thinkingLevel: 'auto' })]);
    const { host, sent } = makeHost(sessionId);

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent).toEqual([
      { type: 'set_model', provider: 'kenari', modelId: 'deepseek-v4-pro' },
      { type: 'prompt', message: 'no level', accessMode: 'yolo' },
    ]);
  });

  test('an item with no model snapshot is sent without touching the model', async () => {
    queue.set(sessionId, [queueItem('session model', null)]);
    const { host, sent } = makeHost(sessionId);

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent).toEqual([{ type: 'prompt', message: 'session model' }]);
  });

  test('a busy session holds the item instead of sending it', async () => {
    queue.set(sessionId, [queueItem('held')]);
    const { host, sent } = makeHost(sessionId);
    host.isBusy = () => true;

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent).toEqual([]);
    expect(queue.get(sessionId)?.length).toBe(1);
  });

  // The regression this file exists for: a delivery that finds the session busy
  // at its tick used to return and stay returned. The run-end that scheduled it
  // is the LAST trigger that run produces, so nothing re-armed it — the queue
  // stalled with no error, and even a manual nudge could not recover it because
  // `scheduleQueueDelivery` early-returns while a fresh entry sits in the map.
  test('a delivery that finds the session busy retries until it goes idle', async () => {
    queue.set(sessionId, [queueItem('held then sent')]);
    const { host, sent } = makeHost(sessionId);
    let busy = true;
    host.isBusy = () => busy;

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    // Held at the first tick — the item must survive untouched.
    expect(sent).toEqual([]);
    expect(queue.get(sessionId)?.length).toBe(1);

    // Still busy across several retry intervals: the item must not be lost.
    jest.advanceTimersByTime(6_000);
    await flush();
    expect(sent).toEqual([]);
    expect(queue.get(sessionId)?.length).toBe(1);

    // The session frees up on its own (the subagent finished, the dialog was
    // answered). No new agent_end arrives; the retry is the only thing that can
    // deliver it.
    busy = false;
    jest.advanceTimersByTime(2_000);
    await flush();

    expect(sent.filter((c) => c.type === 'prompt').length).toBe(1);
    expect(queue.get(sessionId)).toEqual([]);
  });

  test('a retry stops arming once the queue has emptied elsewhere', async () => {
    queue.set(sessionId, [queueItem('taken by another tab')]);
    const { host, sent } = makeHost(sessionId);
    host.isBusy = () => true;

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    // Another tab claimed it while this session was busy.
    queue.set(sessionId, []);
    jest.advanceTimersByTime(2_000);
    await flush();

    // No poll loop is left behind: the host is never asked to deliver again.
    const probesAfterEmpty = sent.length;
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(sent.length).toBe(probesAfterEmpty);
  });

  test('a failed dispatch returns the item to the head', async () => {
    queue.set(sessionId, [queueItem('retry me')]);
    const { host } = makeHost(sessionId);
    host.send = async () => {
      throw new Error('rpc down');
    };

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(queue.get(sessionId)?.map((i) => i.text)).toEqual(['retry me']);
  });

  // A failed dispatch re-arms, so a transient RPC failure drains on its own
  // rather than waiting for a run end that may never come.
  test('a failed dispatch retries and delivers once the send recovers', async () => {
    queue.set(sessionId, [queueItem('transient')]);
    const { host, sent } = makeHost(sessionId);
    let failing = true;
    host.send = async (command) => {
      if (failing) throw new Error('rpc down');
      sent.push(command);
      return {};
    };

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();
    expect(sent).toEqual([]);

    failing = false;
    jest.advanceTimersByTime(2_000);
    await flush();

    expect(sent.filter((c) => c.type === 'prompt').length).toBe(1);
    expect(queue.get(sessionId)).toEqual([]);
  });

  test('repeated triggers deliver the head exactly once', async () => {
    queue.set(sessionId, [queueItem('once')]);
    const { host, sent } = makeHost(sessionId);

    scheduleQueueDelivery(host);
    scheduleQueueDelivery(host);
    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent.filter((c) => c.type === 'prompt').length).toBe(1);
    expect(queue.get(sessionId)).toEqual([]);
  });

  // Attachments reach the server as the persisted display fields only: the
  // composer's `File` never survives the queue row's JSON round trip, and its
  // image preview is a `blob:` object URL the server cannot read. These pin the
  // fields the delivery must use instead — `dataBase64` for the bytes, `type`
  // for the media type, `content` for an inline-able text file.
  test('a queued image rides its persisted base64 payload', async () => {
    const item = queueItem('with image', null);
    item.attachments = [
      { id: 'i', name: 'shot.png', type: 'image/png', size: 4, preview: 'blob:http://x/1', dataBase64: 'iVBORw0KGgo=' },
    ] as QueuedMessage['attachments'];
    queue.set(sessionId, [item]);
    const { host, sent } = makeHost(sessionId);

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent).toEqual([
      {
        type: 'prompt',
        message: 'with image',
        images: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
      },
    ]);
  });

  test('a queued text file is inlined into the delivered prompt', async () => {
    const item = queueItem('review this', null);
    item.attachments = [
      { id: 't', name: 'notes.md', type: 'text/markdown', size: 5, preview: '', content: '# hi' },
    ] as QueuedMessage['attachments'];
    queue.set(sessionId, [item]);
    const { host, sent } = makeHost(sessionId);

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    const prompt = sent.find((c) => c.type === 'prompt');
    expect(prompt?.message).toBe('review this\n\nAttached file: notes.md\n```markdown\n# hi\n```');
  });

  test('an attachment without a payload is not sent as a blank image', async () => {
    const item = queueItem('no payload', null);
    item.attachments = [
      { id: 'i', name: 'broken.png', type: 'image/png', size: 4, preview: 'blob:http://x/1', dataBase64: '' },
    ] as QueuedMessage['attachments'];
    queue.set(sessionId, [item]);
    const { host, sent } = makeHost(sessionId);

    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent).toEqual([{ type: 'prompt', message: 'no payload' }]);
  });

  // The nudge is the RECOVERY path, so it must not itself depend on the
  // mechanism it recovers from. A long-lived `--hot` dev server can stop firing
  // `setTimeout` callbacks entirely; a nudge that merely re-armed the settle
  // timer would fail exactly like the delivery it was meant to rescue. Here no
  // timer is ever advanced — the delivery must complete synchronously.
  test('a nudge delivers immediately without waiting on any timer', async () => {
    queue.set(sessionId, [queueItem('nudged')]);
    const { host, sent } = makeHost(sessionId);

    const delivered = await deliverQueueNow(host);
    await flush();

    // The boolean is the client poll's stop signal: it is how the page knows a
    // tick actually sent something rather than finding nothing to do.
    expect(delivered).toBe(true);
    expect(sent.filter((c) => c.type === 'prompt').length).toBe(1);
    expect(queue.get(sessionId)).toEqual([]);
  });

  test('a nudge on a busy session leaves the item queued and reports no delivery', async () => {
    queue.set(sessionId, [queueItem('busy nudge')]);
    const { host, sent } = makeHost(sessionId);
    host.isBusy = () => true;

    const delivered = await deliverQueueNow(host);
    await flush();

    expect(delivered).toBe(false);
    expect(sent).toEqual([]);
    expect(queue.get(sessionId)?.length).toBe(1);
  });

  test('a nudge with an empty queue reports no delivery', async () => {
    const { host } = makeHost(sessionId);

    const delivered = await deliverQueueNow(host);

    expect(delivered).toBe(false);
  });

  test('a lost timer delays the queue instead of wedging it', async () => {
    queue.set(sessionId, [queueItem('recovered')]);
    const { host, sent } = makeHost(sessionId);

    // A delivery was scheduled but its callback never ran — the entry is left
    // behind, which is exactly what a hot-reloaded module or a wedged event
    // loop leaves. `clearAllTimers` drops the pending callback WITHOUT running
    // it, so the bookkeeping outlives the timer.
    scheduleQueueDelivery(host);
    jest.clearAllTimers();
    jest.advanceTimersByTime(600);
    await flush();
    expect(sent).toEqual([]);

    // Inside the staleness bound a new trigger still defers to the pending
    // entry: the head must not be double-booked.
    jest.advanceTimersByTime(1000);
    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();
    expect(sent).toEqual([]);

    // Past it, a later trigger recovers the queue rather than giving up.
    jest.advanceTimersByTime(5000);
    scheduleQueueDelivery(host);
    jest.advanceTimersByTime(600);
    await flush();

    expect(sent.filter((c) => c.type === 'prompt').length).toBe(1);
    expect(queue.get(sessionId)).toEqual([]);
  });
});
