/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chat timeline scroll container state (auto-fading scrollbar + follow-bottom
 * affordance). Extracted from useChatTimeline so that hook stays under the
 * repo's per-file size ceiling.
 *
 * The follow-bottom affordance is geometry, not an event: content that grows
 * without the user scrolling (history lands, an accordion expands, an image
 * decodes, the panel is resized) never fires `scroll`. Both the container and
 * the content wrapper are therefore observed, so a session opened at the top
 * shows the button without a single scroll event.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Distance from the tail, in pixels, that still counts as "at the bottom". */
const FOLLOW_BOTTOM_THRESHOLD_PX = 100;

export interface ChatTimelineScrollResult {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the timeline's inner content wrapper so its growth is observed. */
  contentRef: (node: HTMLDivElement | null) => void;
  showScrollBottom: boolean;
  isScrolling: boolean;
  handleScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useChatTimelineScroll(): ChatTimelineScrollResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contentRef = useCallback((node: HTMLDivElement | null) => {
    setContentNode(node);
  }, []);

  const syncFollowBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight >= FOLLOW_BOTTOM_THRESHOLD_PX);
  }, []);

  const handleScroll = useCallback(() => {
    syncFollowBottom();
    setIsScrolling(true);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 600);
  }, [syncFollowBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);

  // Re-sync whenever an observed box changes size. `contentNode` is a dep so the
  // observer is rebuilt when the timeline mounts — a session picked from the
  // workspace picker swaps the whole subtree in, and the callback ref fires
  // before this effect, so the node is always available here.
  useEffect(() => {
    syncFollowBottom();
    if (typeof ResizeObserver === 'undefined') return;
    const container = scrollRef.current;
    const observer = new ResizeObserver(syncFollowBottom);
    if (container) observer.observe(container);
    if (contentNode) observer.observe(contentNode);
    return () => observer.disconnect();
  }, [contentNode, syncFollowBottom]);

  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
  }, []);

  return { scrollRef, contentRef, showScrollBottom, isScrolling, handleScroll, scrollToBottom };
}
