/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The delta accumulator rebuilds the accumulated message omp stops sending
 * under `set_event_filter { messageUpdates: "delta" }`.
 *
 * The frame shapes here are copied from a real capture on omp 18.8.3 (see
 * `docs/omp-18.8-adoption-plan.md`, F3): `message_start` carries the whole
 * message and no `assistantMessageEvent`; each `message_update` carries only
 * `{role}` plus one fragment; `message_end` carries the whole message again.
 *
 * Two properties matter and both were bugs first:
 *   - the rebuilt message keeps the SEED's `timestamp`, so `toChatMessage`
 *     derives one row id for the whole stream instead of one per token;
 *   - a `_start` RESETS its block, because the seed already holds that block's
 *     finished text on some builds and the deltas then double it.
 */

import { describe, expect, test } from 'bun:test';

import { createDeltaAccumulator } from '@/shared/lib/chat/omp/delta-accumulator';
import { toChatMessage } from '@/shared/lib/omp/session/mapper';

const SEED = {
  type: 'message_start',
  messageId: 'msg-2',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'hello world' }],
    provider: 'openai',
    model: 'gpt-5',
    timestamp: 1757943900000,
  },
};

const update = (assistantMessageEvent: Record<string, unknown>) => ({
  type: 'message_update',
  messageId: 'msg-2',
  message: { role: 'assistant' },
  assistantMessageEvent,
});

/** Fold a run of frames and report the row each update would render. */
function rows(frames: Array<Record<string, unknown>>) {
  const acc = createDeltaAccumulator();
  const out: Array<{ id: string; content: string }> = [];
  for (const frame of frames) {
    const rebuilt = acc.apply(frame);
    if (rebuilt) {
      const msg = toChatMessage(rebuilt.message, true);
      if (msg) out.push({ id: msg.id, content: msg.content });
    }
    if (frame.type === 'message_end') acc.clear(frame.messageId as string);
  }
  return out;
}

describe('createDeltaAccumulator', () => {
  test('rebuilds one growing row from a seeded text stream', () => {
    const out = rows([
      SEED,
      update({ type: 'text_start', contentIndex: 0 }),
      update({ type: 'text_delta', contentIndex: 0, delta: 'hel' }),
      update({ type: 'text_delta', contentIndex: 0, delta: 'lo wo' }),
      update({ type: 'text_delta', contentIndex: 0, delta: 'rld' }),
      update({ type: 'text_end', contentIndex: 0, content: 'hello world' }),
    ]);
    // ONE row for the whole stream: the id comes from the seed's timestamp.
    expect(new Set(out.map((r) => r.id)).size).toBe(1);
    expect(out.at(-1)?.content).toBe('hello world');
    // The `_start` reset means the seeded text is not appended onto.
    expect(out.map((r) => r.content)).not.toContain('hello worldhello world');
  });

  test('accumulates a streamed tool call into the block the phase reader reads', () => {
    const acc = createDeltaAccumulator();
    acc.apply({
      type: 'message_start',
      messageId: 'm',
      message: { role: 'assistant', content: [], timestamp: 1 },
    });
    acc.apply(update({ type: 'toolcall_start', contentIndex: 0 }));
    const applied = acc.apply(update({ type: 'toolcall_delta', contentIndex: 0, delta: '{"path":' }));
    const partial = applied?.event.partial as { content: Array<Record<string, unknown>> };
    expect(partial.content[0]).toMatchObject({ type: 'toolCall', partialArgs: '{"path":' });
    const end = acc.apply(update({ type: 'toolcall_end', contentIndex: 0, toolCall: { type: 'toolCall', id: 'c1', name: 'write', arguments: { path: 'x' } } }));
    const blocks = (end?.event.partial as { content: Array<Record<string, unknown>> }).content;
    expect(blocks[0]).toMatchObject({ name: 'write', arguments: { path: 'x' } });
  });

  test('passes an accumulated frame through untouched', () => {
    const acc = createDeltaAccumulator();
    // A build that ignores `set_event_filter` still sends the whole message on
    // every update; rebuilding it would be wrong, so the frame is returned as
    // `undefined` (caller uses it verbatim).
    const result = acc.apply({
      type: 'message_update',
      messageId: 'm',
      message: { role: 'assistant', content: [{ type: 'text', text: 'full' }] },
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'ull' },
    });
    expect(result).toBeUndefined();
  });

  test('clear() drops a message so the next run starts fresh', () => {
    const acc = createDeltaAccumulator();
    acc.apply(SEED);
    acc.apply(update({ type: 'text_start', contentIndex: 0 }));
    acc.apply(update({ type: 'text_delta', contentIndex: 0, delta: 'abc' }));
    acc.clear('msg-2');
    const restarted = acc.apply(update({ type: 'text_delta', contentIndex: 0, delta: 'xyz' }));
    const blocks = (restarted?.event.partial as { content: Array<Record<string, unknown>> }).content;
    expect(blocks[0]).toMatchObject({ text: 'xyz' });
  });
});
