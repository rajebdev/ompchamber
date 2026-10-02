

/** The raf batcher's contract: it delivers coalesced updates on the next
 * animation frame and drops the queue on unmount, so a burst of stream frames
 * collapses to one render. Split out of `stream.test.ts` to keep both files
 * under the repo's 350-line ceiling; the cases are unchanged. */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { createRafBatch } from '@/shared/lib/chat/timeline/stream-raf';

let frames: Array<(() => void) | null>;
const realRaf = globalThis.requestAnimationFrame;
const realCancelRaf = globalThis.cancelAnimationFrame;

function drainFrames(): void {
  const queued = frames;
  frames = [];
  for (const fn of queued) fn?.();
}

beforeEach(() => {
  frames = [];
  (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: () => void) => {
    frames.push(cb);
    return frames.length;
  };
  (globalThis as Record<string, unknown>).cancelAnimationFrame = (handle: number) => {
    frames[handle - 1] = null;
  };
});

afterEach(() => {
  (globalThis as Record<string, unknown>).requestAnimationFrame = realRaf;
  (globalThis as Record<string, unknown>).cancelAnimationFrame = realCancelRaf;
});


describe('createRafBatch', () => {
  test('a burst of keyless updates applies in arrival order, once per frame', () => {
    const applied: string[] = [];
    let flushes = 0;
    const batch = createRafBatch<string[]>((updater) => applied.push(updater([])[0]), () => { flushes += 1; });

    batch.queue((prev) => [...prev, 'a']);
    batch.queue((prev) => [...prev, 'b']);
    batch.queue((prev) => [...prev, 'c']);

    expect(applied).toEqual([]);
    drainFrames();
    expect(applied).toEqual(['a', 'b', 'c']);
    expect(flushes).toBe(1);
  });

  test('a keyed burst keeps only the newest payload, replacing in place', () => {
    const applied: string[] = [];
    const batch = createRafBatch<string[]>((updater) => applied.push(updater([])[0]));

    batch.queue(() => ['first'], 'msg-1');
    batch.queue(() => ['second'], 'msg-1');
    batch.queue(() => ['third'], 'msg-1');
    batch.queue(() => ['other'], 'msg-2');

    drainFrames();
    expect(applied).toEqual(['third', 'other']);
  });

  test('flush applies synchronously, invalidates the frame, and no-ops when empty', () => {
    const applied: string[] = [];
    let flushes = 0;
    const batch = createRafBatch<string[]>((updater) => applied.push(updater([])[0]), () => { flushes += 1; });

    batch.flush();
    drainFrames();
    expect(applied).toEqual([]);
    expect(flushes).toBe(0);

    batch.queue(() => ['pending']);
    batch.flush();
    expect(applied).toEqual(['pending']);
    expect(flushes).toBe(1);

    // The frame that was already scheduled must not apply the batch a second time.
    drainFrames();
    expect(applied).toEqual(['pending']);
    expect(flushes).toBe(1);
  });

  test('cancel drops queued updates and the pending frame stays inert', () => {
    const applied: string[] = [];
    const batch = createRafBatch<string[]>((updater) => applied.push(updater([])[0]));

    batch.queue(() => ['dropped']);
    batch.cancel();
    drainFrames();

    expect(applied).toEqual([]);

    // The batcher still works after a cancel.
    batch.queue(() => ['kept']);
    drainFrames();
    expect(applied).toEqual(['kept']);
  });
});
