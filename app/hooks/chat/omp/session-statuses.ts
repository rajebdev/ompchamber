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
 * entirely for an open session — and the next revalidate, which no longer
 * sees the deleted row, drops it naturally.
 */
export function useSessionStatusAck(
  statusMap: Record<string, SessionStreamStatus>,
  activeSessionId: number | string | null,
): void {
  const activeId = activeSessionId === null ? null : String(activeSessionId);
  const activeStatus = activeId !== null ? statusMap[activeId] : undefined;
  // One POST per (session, status): between the ack and the revalidate that
  // drops the row, identity changes in statusMap would re-fire the effect.
  const ackedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeStatus || activeStatus === 'stream') return;
    const ackKey = `${activeId}:${activeStatus}`;
    if (ackedRef.current === ackKey) return;
    ackedRef.current = ackKey;
    void fetch(`/api/sessions/${encodeURIComponent(activeId as string)}/stream-seen`, { method: 'POST' }).catch(() => {});
  }, [activeId, activeStatus]);
}
