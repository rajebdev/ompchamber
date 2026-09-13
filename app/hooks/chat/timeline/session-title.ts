/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Navbar session-title state for the chamber. Owns the optimistic rename
 * override so the header updates live — the sidebar dispatches
 * `omp:session-renamed` after a successful rename, no session refetch needed.
 */

import { useEffect, useState } from 'react';
import { isPendingSessionId, pendingSessionTitle } from '@/lib/omp/session/default-title';

/** Navbar session title: timestamped default while a "new-…" session is pending;
 *  a rename event overrides until the session's own metadata arrives. */
export function useSessionTitle(
  sessionId: string | null,
  serverTitle: string | null | undefined,
  onSessionTitle?: (title: string | null) => void,
): void {
  const [renamedTitle, setRenamedTitle] = useState<string | null>(null);
  // Drop the optimistic override when the user switches sessions.
  useEffect(() => { setRenamedTitle(null); }, [sessionId]);
  // Sidebar dispatches `omp:session-renamed` (detail { sessionId, title }) after
  // a successful PATCH so the header updates without refetching the session.
  useEffect(() => {
    const onRenamed = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; title?: string }>).detail;
      if (!detail?.sessionId || !detail.title || String(detail.sessionId) !== String(sessionId)) return;
      setRenamedTitle(detail.title);
    };
    window.addEventListener('omp:session-renamed', onRenamed);
    return () => window.removeEventListener('omp:session-renamed', onRenamed);
  }, [sessionId]);
  useEffect(() => {
    const pending = isPendingSessionId(sessionId) ? pendingSessionTitle(sessionId) : null;
    onSessionTitle?.(pending ?? renamedTitle ?? serverTitle ?? null);
  }, [sessionId, serverTitle, renamedTitle, onSessionTitle]);
}
