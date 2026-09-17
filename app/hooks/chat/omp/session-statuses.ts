/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sidebar session stream status — server-authoritative via SQLite.
 *
 * The status rides the loader's session items (`streamStatus` field); the
 * sidebar already revalidates on stream events (`omp:session-updated`
 * dispatch → revalidator), so spinner and check update with the list they
 * belong to. Opening a session acknowledges the one-shot terminal badge
 * (`finish` / `abort` / `error`) via POST /api/sessions/:id/stream-seen so
 * the check shows exactly once, then disappears from the rendered list.
 */

import { useEffect, useRef } from 'react';
import type { SessionItemData } from '@/types';

export type SessionStreamStatus = NonNullable<SessionItemData['streamStatus']>;

/** Derive { sessionId → status } from the loader-provided folders. */
export function buildSidebarSessionStatus(
  folders: { sessions?: SessionItemData[] }[],
): Record<string, SessionStreamStatus> {
  const map: Record<string, SessionStreamStatus> = {};
  for (const folder of folders) {
    for (const session of folder.sessions ?? []) {
      if (session.streamStatus) map[String(session.id)] = session.streamStatus;
    }
  }
  return map;
}

/**
 * Opening a session with a terminal badge acknowledges it on the server
 * (one POST per session+status) so the check shows EXACTLY ONCE: the badge
 * keeps rendering on this pass — stripping it here would suppress the paint
 * entirely for an open session. Once the POST lands, a revalidate pulls
 * loader data without the deleted row, dropping the check from the list.
 *
 * Click paths call `markSeen` (optimistic strip + ack) BEFORE the status map
 * can even carry the badge; `skip` lets the caller suppress this effect for
 * sessions the click already handled, so the two never double-POST.
 */
export function useSessionStatusAck(
  statusMap: Record<string, SessionStreamStatus>,
  activeSessionId: number | string | null,
  revalidate: () => void,
  skip?: (sessionId: number | string) => boolean,
): void {
  const activeId = activeSessionId === null ? null : String(activeSessionId);
  const activeStatus = activeId !== null ? statusMap[activeId] : undefined;
  // One POST per (session, status): between the ack and the revalidate that
  // drops the row, identity changes in statusMap would re-fire the effect.
  const ackedRef = useRef<string | null>(null);
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  const skipRef = useRef(skip);
  skipRef.current = skip;

  useEffect(() => {
    if (!activeStatus || activeStatus === 'stream') return;
    if (skipRef.current?.(activeId as string)) return;
    const ackKey = `${activeId}:${activeStatus}`;
    if (ackedRef.current === ackKey) return;
    ackedRef.current = ackKey;
    // Stale-map guard: statusMap can lag a busy list by up to one fetch. If
    // the badge was actually overwritten by a fresh `stream` (agent_start
    // raced the sidebar refetch), the server now refuses to delete the row
    // and reports deleted:false — treat the POST as void so the effect can
    // re-ack the real terminal badge when the run later ends.
    fetch(`/api/sessions/${encodeURIComponent(activeId as string)}/stream-seen`, { method: 'POST' })
      .then((res) => res.json() as Promise<{ deleted?: boolean }>)
      .then((body) => {
        if (body.deleted === false) ackedRef.current = null;
        revalidateRef.current();
      })
      .catch(() => {
        ackedRef.current = null;
      });
  }, [activeId, activeStatus]);
}
