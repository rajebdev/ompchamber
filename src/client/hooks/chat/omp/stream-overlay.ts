/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Optimistic `stream` overlay for the session sidebar.
 *
 * The row that drives the spinner is written server-side when the prompt is
 * DISPATCHED, so the click→dispatch window (a spawn/resume round trip — up to
 * seconds on a cold session) has nothing in the sidebar saying a run is coming,
 * and the chat's own `isGenerating` is local to its timeline, so switching
 * sessions drops it. The send path arms a mark here; the sidebar renders it as
 * `stream` until the authoritative row arrives.
 *
 * A CLIENT-side mark rather than a server write, deliberately: a `stream` row
 * written before the run exists is owned by the live server process while no
 * live run stands behind it — exactly the shape `healStaleStreamStatuses`'
 * orphan rule releases — so the spinner would be gone again by the next list
 * load. The in-flight click is a property of THIS tab, which is what this
 * module stores.
 */

import type { WorkspaceFolderData } from '@/shared/types';

/** Window event carrying one session's optimistic mark arm/disarm. */
export const STREAM_PENDING_EVENT = 'omp:stream-pending';

export interface StreamPendingDetail {
  sessionId: string;
  pending: boolean;
}

/** Arm (or disarm) the optimistic `stream` mark for one session. */
export function setStreamPending(sessionId: string, pending: boolean): void {
  window.dispatchEvent(
    new CustomEvent<StreamPendingDetail>(STREAM_PENDING_EVENT, {
      detail: { sessionId, pending },
    }),
  );
}

/**
 * Drop marks a snapshot has already superseded.
 *
 * A snapshot that landed AFTER the mark carried a real status for the session,
 * so the authoritative row has arrived and the mark's job is done. A snapshot
 * that predates the mark is left alone: it can only carry the PREVIOUS run's
 * terminal badge, and clearing on it would switch the click's spinner back off
 * during the very round trip this exists to cover.
 *
 * Returns true when the set changed, so the caller can re-render.
 */
export function releaseObservedPending(
  pending: Map<string, number>,
  folders: WorkspaceFolderData[],
): boolean {
  if (pending.size === 0) return false;
  const arrivedAt = Date.now();
  let released = false;
  for (const folder of folders) {
    for (const session of folder.sessions ?? []) {
      const key = String(session.id);
      const armedAt = pending.get(key);
      if (armedAt === undefined || !session.streamStatus || arrivedAt < armedAt) continue;
      pending.delete(key);
      released = true;
    }
  }
  return released;
}

/**
 * Apply the two optimistic overlays to the loader's folders, seen-strip first.
 *
 * `seen` hides a one-shot terminal badge this mount already acked; `pending`
 * FORCES `stream` so the click's spinner survives the dispatch round trip (and
 * a session switch, since the mark outlives any single timeline).
 */
export function applyStreamOverlay(
  folders: WorkspaceFolderData[],
  seen: Set<string>,
  pending: Map<string, number>,
): WorkspaceFolderData[] {
  if (seen.size === 0 && pending.size === 0) return folders;
  return folders.map((folder) => ({
    ...folder,
    sessions: (folder.sessions ?? []).map((session) => {
      const key = String(session.id);
      const stripped =
        seen.has(key) && session.streamStatus && session.streamStatus !== 'stream'
          ? { ...session, streamStatus: undefined }
          : session;
      if (!pending.has(key)) return stripped;
      return { ...stripped, streamStatus: 'stream' as const };
    }),
  }));
}
