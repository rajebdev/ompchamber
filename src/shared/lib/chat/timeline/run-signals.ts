/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The run-boundary half of the chat's omp callbacks: the three points at which
 * a run opens or is reattached, and the sidebar must be told so it re-reads the
 * session list (and, for a fresh spawn, paints its own spinner).
 *
 * Split from `omp-callbacks.ts` to keep that file under the repo's per-file
 * size ceiling; the closures take the caller's deps record, so the captured
 * semantics are unchanged.
 */

import type { OmpAgentCallbacksDeps } from '@/shared/lib/chat/timeline/omp-callbacks';
import { PHASE_VERBS } from '@/shared/lib/chat/timeline/tool-phrases';
import { setStreamPending } from '@/client/hooks/chat/omp/stream-overlay';

/** Ask the sidebars to re-read the session list. Leading-edge throttled
 *  upstream, so a per-turn call is cheap. */
function signalSessionUpdated(sid: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: sid } }));
}

/** A run STARTED: resume the generating UI, re-arm the once-per-run assistant
 *  signal, and tell the sidebar (which picks up the server's `stream` row). */
export function handleAgentStart(deps: OmpAgentCallbacksDeps): void {
  const { setGenerating, setGeneratingVerb, scrollToBottom, firstAssistantRef, adoptedSessionIdRef, sessionIdRef, metaRefreshedRef, refreshSessionMeta } = deps;
  setGenerating(true);
  setGeneratingVerb(PHASE_VERBS.thinking);
  setTimeout(() => scrollToBottom('smooth'), 50);
  // A fresh run re-arms the first-assistant signal.
  firstAssistantRef.current = false;
  const sid = adoptedSessionIdRef.current ?? sessionIdRef.current;
  if (!sid) return;
  // Signalled on EVERY run start: the metaRefreshedRef guard below is
  // once-per-session (title refresh), but the sidebar must revalidate each time
  // to pick up the server's `stream` status row.
  signalSessionUpdated(sid);
  if (metaRefreshedRef.current !== sid) {
    metaRefreshedRef.current = sid;
    setTimeout(() => refreshSessionMeta(sid), 100);
  }
}

/** Every turn inside the run re-signals the sidebar: it recovers the `stream`
 *  row if a previous dispatch raced with the status write, or the row was
 *  healed away. */
export function handleTurnStart(deps: OmpAgentCallbacksDeps): void {
  const sid = deps.adoptedSessionIdRef.current ?? deps.sessionIdRef.current;
  if (sid) signalSessionUpdated(sid);
}

/**
 * Reload recovery: the omp process kept running server-side, so the event
 * stream is reattached and the generating UI must resume (the timeline fetch
 * already loaded the committed messages; live updates continue).
 */
export function handleResumeStream(deps: OmpAgentCallbacksDeps): void {
  const { setGenerating, setGeneratingVerb, scrollToBottom, firstAssistantRef, adoptedSessionIdRef, sessionIdRef } = deps;
  setGenerating(true);
  setGeneratingVerb(PHASE_VERBS.thinking);
  setTimeout(() => scrollToBottom('smooth'), 50);
  // Reattach re-arms the signal too: the reattached run's first assistant turn
  // has not been signalled by THIS mount.
  firstAssistantRef.current = false;
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
  signalSessionUpdated(sid);
}
