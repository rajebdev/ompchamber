/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subscribe to the chat timeline's `omp:session-processing` window event for a
 * single session (all sessions when `sessionId` is empty). Consumers outside
 * the chat subtree — the context panel's live-refresh polling — use this to
 * know when the active session is streaming without prop drilling through the
 * layout.
 */

import { useEffect, useState } from 'react';

const PROCESSING_EVENT = 'omp:session-processing';

interface SessionProcessingDetail {
  sessionId: string;
  processing: boolean;
}

export function useAgentProcessing(sessionId?: string | null): boolean {
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onProcessing = (event: Event) => {
      const detail = (event as CustomEvent<SessionProcessingDetail>).detail;
      if (!detail) return;
      // Empty sessionId consumes every session's status (consumers that render
      // before the route resolves); otherwise match exactly so a background
      // session's run cannot flip this session's indicator.
      if (sessionId && detail.sessionId !== sessionId) return;
      setProcessing(detail.processing);
    };
    window.addEventListener(PROCESSING_EVENT, onProcessing);
    return () => window.removeEventListener(PROCESSING_EVENT, onProcessing);
  }, [sessionId]);

  return processing;
}
