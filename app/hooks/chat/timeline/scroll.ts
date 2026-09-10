/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chat timeline scroll container state (auto-fading scrollbar + follow-bottom
 * affordance). Extracted from useChatTimeline so that hook stays under the
 * repo's per-file size ceiling.
 */

import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export interface ChatTimelineScrollResult {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showScrollBottom: boolean;
  setShowScrollBottom: Dispatch<SetStateAction<boolean>>;
  isScrolling: boolean;
  handleScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useChatTimelineScroll(): ChatTimelineScrollResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight >= 100);
    setIsScrolling(true);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 600);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);

  return { scrollRef, showScrollBottom, setShowScrollBottom, isScrolling, handleScroll, scrollToBottom };
}
