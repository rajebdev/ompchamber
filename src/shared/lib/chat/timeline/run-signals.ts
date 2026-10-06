/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The run-boundary half of the chat's omp callbacks: the three points at which
 * a run opens or is reattached.
 *
 * The sidebar is no longer signalled from here — it reads the realtime
 * `sidebar`/`sidebar:status` topics, and the optimistic mark rides the
 * `stream-pending` client signal. What remains is the timeline's own state
 * (the generating UI and the meta refresh).
 *
 * Split from `omp-callbacks.ts` to keep that file under the repo's per-file
 * size ceiling; the closures take the caller's deps record, so the captured
 * semantics are unchanged.
 */

import type { OmpAgentCallbacksDeps } from '@/shared/lib/chat/timeline/omp-callbacks';
import { PHASE_VERBS } from '@/shared/lib/chat/timeline/tool-phrases';
import { setStreamPending } from '@/client/hooks/chat/omp/stream-overlay';

/** A run STARTED: resume the generating UI and refresh the session metadata. */
export function handleAgentStart(deps: OmpAgentCallbacksDeps): void {
  const { setGenerating, setGeneratingVerb, scrollToBottom, adoptedSessionIdRef, sessionIdRef, metaRefreshedRef, refreshSessionMeta } = deps;
  setGenerating(true);
  setGeneratingVerb(PHASE_VERBS.thinking);
  setTimeout(() => scrollToBottom('smooth'), 50);
  const sid = adoptedSessionIdRef.current ?? sessionIdRef.current;
  if (!sid) return;
  if (metaRefreshedRef.current !== sid) {
    metaRefreshedRef.current = sid;
    setTimeout(() => refreshSessionMeta(sid), 100);
  }
}

/** Every turn inside the run. The sidebar is not signalled: it follows the
 *  `sidebar:status` topic, which the server publishes on the same status write
 *  this used to recover by re-reading. */
export function handleTurnStart(_deps: OmpAgentCallbacksDeps): void {
  // Nothing to do — kept as the callbacks' named boundary.
}

/**
 * Reload recovery: the omp process kept running server-side, so the event
 * stream is reattached and the generating UI must resume (the timeline fetch
 * already loaded the committed messages; live updates continue).
 */
export function handleResumeStream(deps: OmpAgentCallbacksDeps): void {
  const { setGenerating, setGeneratingVerb, scrollToBottom, adoptedSessionIdRef, sessionIdRef } = deps;
  setGenerating(true);
  setGeneratingVerb(PHASE_VERBS.thinking);
  setTimeout(() => scrollToBottom('smooth'), 50);
  const sid = adoptedSessionIdRef.current ?? sessionIdRef.current;
  if (!sid) return;
  // Re-arm the optimistic mark as well, because for a fresh spawn the server's
  // row cannot reach the sidebar at all: the list route buckets sessions out of
  // omp's transcript scan, and omp has not written the file yet, so the session
  // is absent from the payload and `isSessionStreaming` reports false however
  // long the run has left to go. Measured on a reload 5s into a 25s run: the
  // generating indicator resumed (this frame) while the sidebar spinner stayed
  // dark until the file appeared at ~18s. `onAgentEnd` releases the mark.
  setStreamPending(sid, true);
}
