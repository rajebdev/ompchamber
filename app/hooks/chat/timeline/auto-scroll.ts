/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Follow-bottom when a session is opened. Committed history is fetched
 * asynchronously (session-load.ts), so the timeline paints at `scrollTop = 0`
 * long before the messages land — and nothing else scrolls a finished session,
 * because every other trigger lives in the streaming callbacks. This jumps to
 * the tail exactly once per session, on the commit where that session's
 * messages appear.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ChatMessageData } from '@/types';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface UseTimelineAutoScrollDeps {
  sessionId: string | null;
  /** Committed timeline; its identity changes when history lands. */
  messages: ChatMessageData[];
  /** Scroll container owned by useChatTimelineScroll. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Pending "new-…" sessions render the workspace picker, which owns its own
   *  timeline and scroll handling. */
  enabled: boolean;
}

export function useTimelineAutoScroll(deps: UseTimelineAutoScrollDeps): void {
  const { sessionId, messages, scrollRef, scrollToBottom, enabled } = deps;
  // Session the container was last rendering. On the commit where this flips
  // the DOM still holds the previous session's rows, so scrolling then would
  // aim at content that is about to be replaced.
  const renderedRef = useRef<string | null>(null);
  // Session whose opening scroll has already been served.
  const servedRef = useRef<string | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (renderedRef.current !== sessionId) {
      renderedRef.current = sessionId;
      servedRef.current = null;
      return;
    }
    if (!enabled || !sessionId || messages.length === 0) return;
    if (servedRef.current === sessionId) return;
    if (!scrollRef.current) return;
    servedRef.current = sessionId;
    // Layout effect + 'instant': the rows are already committed and reading
    // scrollHeight forces layout, so the jump lands before the browser paints.
    // 'instant' is required because the container carries Tailwind's
    // `scroll-smooth`, which 'auto' would resolve to.
    scrollToBottom('instant');
  }, [sessionId, messages, enabled, scrollRef, scrollToBottom]);
}
