/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-side follow-up queue auto-delivery: the run's own `agent_end` — as
 * observed by the session wrapper, the process that owns the omp child —
 * triggers the next queued prompt. This replaces the client-driven
 * auto-delivery whose state races (tab reload wiping the table, session
 * switches sending a queue into the wrong session) made queued messages
 * disappear or land in the wrong conversation.
 *
 * Semantics:
 * - The head is CLAIMED (transactional DELETE) before dispatch, so a second
 *   trigger — another tab's nudge, a racing run end — can never double-send.
 * - A failed dispatch re-inserts the item at the head; nothing is lost.
 * - A user Stop clears the pending-delivery timer instead of delivering (the
 *   item stays claimed-but-returned... it is re-queued first), so stop-all
 *   semantics live on the server now.
 */

import { claimHeadQueueItem, requeueHeadQueueItem } from '@/server/lib/queue/store.server';
import type { QueuedMessage } from '@/shared/types/chat';

/** Settling time between agent_end and the next prompt dispatch. Small on
 *  purpose: omp's own turn-end bookkeeping (JSONL flush, title slot) runs on
 *  the same child, and an instant dispatch races it. */
const DELIVERY_DELAY_MS = 500;

/**
 * How long a scheduled-but-not-yet-run delivery may sit before the next
 * trigger supersedes it.
 *
 * Without this, one lost timer wedges the session's queue FOREVER: the guard
 * below early-returns on any existing entry, so nothing would ever schedule
 * again. A timer can be lost without the process dying — `bun --hot`
 * re-evaluating this module discards the pending closure, and a wedged event
 * loop drops the callback — and the symptom is silent: the queue simply never
 * drains and no error is reported. Past this bound the entry is presumed lost
 * and rescheduled, so a client nudge (sent whenever a session with queued
 * items mounts or regains focus) always recovers the queue.
 */
const DELIVERY_STALE_MS = 5_000;

interface PendingDelivery {
  timer: ReturnType<typeof setTimeout>;
  /** Wall-clock after which this entry is presumed lost and superseded. */
  expiresAt: number;
}

/** Per-session pending delivery timer, so a second agent_end while one is
 *  already scheduled cannot double-book the head. */
const pendingTimers = new Map<string, PendingDelivery>();

function clearPendingTimer(sessionId: string): void {
  const entry = pendingTimers.get(sessionId);
  if (entry === undefined) return;
  clearTimeout(entry.timer);
  pendingTimers.delete(sessionId);
}

/** Send one queued item to the session as a normal prompt. The model snapshot
 *  rides first (set_model / set_thinking_level) exactly like the composer's
 *  queued delivery did. Returns false when the dispatch failed. */
async function dispatchQueuedItem(session: QueueDeliveryHost, item: QueuedMessage): Promise<boolean> {
  try {
    if (item.model) {
      await session.send({ type: 'set_model', provider: item.model.provider, modelId: item.model.modelId });
      if (item.model.thinkingLevel !== 'auto') {
        await session.send({ type: 'set_thinking_level', level: item.model.thinkingLevel });
      }
    }
    const images = item.attachments
      .filter((a) => typeof a?.preview === 'string' && a.preview.startsWith('data:image/') && typeof a?.dataBase64 === 'string')
      .map((a) => ({ type: 'image' as const, data: a.dataBase64 as string, mimeType: a.preview.slice(5).split(';')[0] || 'image/png' }));
    await session.send({
      type: 'prompt',
      message: item.text,
      ...(images.length ? { images } : {}),
      ...(item.model ? { accessMode: item.model.accessMode } : {}),
    });
    return true;
  } catch (error) {
    console.error(`[queue] delivery failed for session ${session.sessionId}:`, error);
    return false;
  }
}

/** Minimal surface delivery needs from a live session wrapper. */
export interface QueueDeliveryHost {
  sessionId: string;
  isAlive(): boolean;
  isBusy(): boolean;
  send(command: Record<string, unknown>): Promise<unknown>;
}

/**
 * Schedule the next queued delivery for this session. Called on terminal
 * agent_end and on a client's mount nudge. Idempotent: an in-flight timer is
 * reused, a claimed head can only be won by one caller.
 *
 * A pending entry older than {@link DELIVERY_STALE_MS} is presumed lost (see
 * that constant) and replaced, so a dropped timer delays the queue instead of
 * wedging it.
 */
export function scheduleQueueDelivery(session: QueueDeliveryHost): void {
  const sessionId = session.sessionId;
  if (!sessionId) return;
  const pending = pendingTimers.get(sessionId);
  if (pending !== undefined) {
    if (Date.now() < pending.expiresAt) return;
    // Lost timer: clear it so its callback cannot also fire and double-deliver.
    clearTimeout(pending.timer);
  }
  const timer = setTimeout(() => {
    pendingTimers.delete(sessionId);
    void deliverNext(session);
  }, DELIVERY_DELAY_MS);
  pendingTimers.set(sessionId, { timer, expiresAt: Date.now() + DELIVERY_STALE_MS });
}

async function deliverNext(session: QueueDeliveryHost): Promise<void> {
  const sessionId = session.sessionId;
  if (!session.isAlive() || session.isBusy()) return;
  const item = claimHeadQueueItem(sessionId);
  if (!item) return;
  const ok = await dispatchQueuedItem(session, item);
  if (!ok) await requeueHeadQueueItem(sessionId, item);
}

/**
 * A user Stop: return anything already claimed for this session's pending
 * delivery to the queue and cancel the timer. The item keeps its head
 * position; nothing is sent until the next run end or explicit send.
 */
export function cancelQueuedDelivery(sessionId: string): void {
  clearPendingTimer(sessionId);
}

/** Forget a session's timer state (process teardown, session destroy). */
export function forgetQueuedDelivery(sessionId: string): void {
  clearPendingTimer(sessionId);
}
