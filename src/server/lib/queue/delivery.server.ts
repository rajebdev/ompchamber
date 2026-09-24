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

import { claimHeadQueueItem, hasQueuedItem, requeueHeadQueueItem } from '@/server/lib/queue/store.server';
import { composeMessageWithTextAttachments } from '@/shared/lib/chat/attachments';
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
 * again. A timer can be lost without the process dying — a wedged event loop
 * drops the callback — and the symptom is silent: the queue simply never
 * drains and no error is reported. Past this bound the entry is presumed lost
 * and rescheduled, so a client nudge (sent whenever a session with queued
 * items mounts or regains focus) always recovers the queue.
 *
 * This covers only a timer that never RUNS. A delivery that runs and cannot
 * proceed re-arms itself (see {@link DELIVERY_RETRY_MS}); the two paths are
 * independent, so neither depends on a client trigger arriving.
 */
const DELIVERY_STALE_MS = 5_000;

/**
 * Retry interval for a delivery that could not run: the session was busy at its
 * tick, or the attempt itself failed.
 *
 * A busy session is the common case, not an edge one — a subagent outlives the
 * parent turn's `agent_end`, a compaction runs after it, and an ask/approval
 * dialog parks it indefinitely — and every one of those is exactly when the
 * run-end trigger fires. `isBusy()` is an in-memory flag read, so polling it
 * costs nothing; the alternative (a wake hook per busy source) would need
 * re-wiring every time a new source is added.
 */
const DELIVERY_RETRY_MS = 2_000;

interface PendingDelivery {
  timer: ReturnType<typeof setTimeout>;
  /** Wall-clock after which this entry is presumed lost and superseded. */
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __ompQueueDeliveryTimers: Map<string, PendingDelivery> | undefined;
}

/** Per-session pending delivery timer, so a second agent_end while one is
 *  already scheduled cannot double-book the head.
 *
 *  On `globalThis` for the same reason the session registry is: a `bun --hot`
 *  soft reload re-evaluates this module but keeps globalThis, so a module-local
 *  map would silently orphan every pending entry — the reloaded module would
 *  see an empty map, `clearPendingTimer` could no longer cancel the orphan, and
 *  the session's queue would stall with nothing logged. */
function getPendingTimers(): Map<string, PendingDelivery> {
  if (!globalThis.__ompQueueDeliveryTimers) globalThis.__ompQueueDeliveryTimers = new Map();
  return globalThis.__ompQueueDeliveryTimers;
}

function clearPendingTimer(sessionId: string): void {
  const pendingTimers = getPendingTimers();
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
    // Attachments reach this point as the persisted display fields — the live
    // `File` never survived the queue's JSON round trip. The base64 payload and
    // the MIME type are therefore read from the fields that DID persist:
    // `dataBase64` for the bytes, `type` for the media type. (Matching on a
    // `data:` preview used to yield zero images, because the composer's preview
    // is a `blob:` object URL that the server cannot read.)
    const images = item.attachments
      .filter((a) => typeof a?.dataBase64 === 'string' && a.dataBase64.length > 0)
      .map((a) => ({
        type: 'image' as const,
        data: a.dataBase64 as string,
        mimeType: typeof a.type === 'string' && a.type.startsWith('image/') ? a.type : 'image/png',
      }));
    // Text attachments are inlined into the prompt, exactly as the composer
    // does at send time — the item's own `text` is the raw composer input, so
    // without this a queued file would deliver as a bare filename mention.
    const textFiles = item.attachments
      .filter((a) => typeof a?.content === 'string' && a.content.length > 0)
      .map((a) => ({
        name: typeof a.name === 'string' && a.name ? a.name : 'attachment',
        mimeType: typeof a.type === 'string' ? a.type : 'text/plain',
        content: a.content as string,
        size: typeof a.size === 'number' ? a.size : (a.content as string).length,
      }));
    await session.send({
      type: 'prompt',
      message: composeMessageWithTextAttachments(item.text, textFiles),
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
  const pendingTimers = getPendingTimers();
  const pending = pendingTimers.get(sessionId);
  if (pending !== undefined) {
    if (Date.now() < pending.expiresAt) return;
    // Lost timer: clear it so its callback cannot also fire and double-deliver.
    clearTimeout(pending.timer);
  }
  armDelivery(session, DELIVERY_DELAY_MS);
}

/**
 * Deliver the head right now, with no timer involved. Returns whether an item
 * was actually sent.
 *
 * The nudge route's entry point: the failure a nudge recovers from is a lost
 * timer, so the nudge itself must not depend on one. Busy sessions re-arm the
 * normal retry (which is timer-based, and harmless — the nudge is a bonus path,
 * not the only one), and an empty queue is a no-op.
 */
export async function deliverQueueNow(session: QueueDeliveryHost): Promise<boolean> {
  return deliverNext(session);
}

/** Arm (or re-arm) this session's delivery tick. */
function armDelivery(session: QueueDeliveryHost, delayMs: number): void {
  const sessionId = session.sessionId;
  const pendingTimers = getPendingTimers();
  const timer = setTimeout(() => {
    pendingTimers.delete(sessionId);
    // The attempt is fire-and-forget from the timer's perspective, but it must
    // never reject silently: an unhandled rejection here is how a throwing
    // `claimHeadQueueItem` (a `getDbSync()` before the db is resolved) or a
    // failing RPC turned into a queue that simply stopped draining with nothing
    // in the log. `deliverNext` owns its own failure handling; this catch is
    // the last resort so the failure is at least reported.
    deliverNext(session).catch((error) => {
      console.error(`[queue] delivery attempt failed for session ${sessionId}:`, error);
    });
  }, delayMs);
  pendingTimers.set(sessionId, { timer, expiresAt: Date.now() + DELIVERY_STALE_MS });
}

/**
 * Re-arm the retry, but only while there is still something to deliver.
 *
 * A busy session whose queue emptied in the meantime (another tab took the
 * head, or the user deleted the row) must not leave a poll loop running
 * forever.
 */
async function armRetryIfQueued(session: QueueDeliveryHost): Promise<void> {
  if (await hasQueuedItem(session.sessionId)) armDelivery(session, DELIVERY_RETRY_MS);
}

/**
 * Deliver the head, or re-arm and try again later. True when an item was sent.
 *
 * A busy session is the normal case at the moment this runs — the run-end that
 * scheduled it fires while a subagent, a compaction or an ask dialog is still
 * live, and `isBusy()` is true for all three. Returning there is what used to
 * strand the queue permanently: the timer had already been deleted from the map
 * by its own callback, so nothing remained to retry it and no later trigger was
 * guaranteed to arrive. Re-arming keeps the retry owned by this module.
 */
async function deliverNext(session: QueueDeliveryHost): Promise<boolean> {
  const sessionId = session.sessionId;
  if (!session.isAlive()) return false;
  if (session.isBusy()) {
    await armRetryIfQueued(session);
    return false;
  }
  const item = await claimHeadQueueItem(sessionId);
  if (!item) return false;
  const ok = await dispatchQueuedItem(session, item);
  if (!ok) {
    await requeueHeadQueueItem(sessionId, item);
    // The dispatch threw (provider error, dead child). Retry on the same cadence
    // a busy session gets, so a transient failure drains without user action.
    await armRetryIfQueued(session);
    return false;
  }
  return true;
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
