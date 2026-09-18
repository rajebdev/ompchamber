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
 *
 * Streaming auto-scroll is stick-to-bottom: `scrollToBottom` only actually
 * moves the viewport while `follow` is engaged. The user scrolling away from
 * the tail disengages it (the scroll fight is gone — they can read while the
 * AI generates); scrolling back near the tail, or clicking the scroll-bottom
 * button, re-engages it. Programmatic jumps (`scrollTo`) never flip the mode.
 */

import type { RefObject } from 'preact/compat';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/** Distance from the tail, in pixels, that still counts as "at the bottom". */
const FOLLOW_BOTTOM_THRESHOLD_PX = 100;

export interface ChatTimelineScrollOptions {
  /** Called when the viewport reaches the top (history paging trigger).
   *  Ref-indirect; the hook never depends on the callback's identity. */
  onScrollTop?: () => void;
}

export interface ChatTimelineScrollResult {
  scrollRef: RefObject<HTMLDivElement>;
  /** Attach to the timeline's inner content wrapper so its growth is observed. */
  contentRef: (node: HTMLDivElement | null) => void;
  showScrollBottom: boolean;
  isScrolling: boolean;
  /** Streaming auto-scroll gates on this: pinned to the tail = true. */
  followRef: RefObject<boolean>;
  handleScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Jump to the tail and re-engage follow mode (scroll-bottom button). */
  jumpToBottom: (behavior?: ScrollBehavior) => void;
}

/** Distance from the top that counts as "reached the history boundary". */
const SCROLL_TOP_TRIGGER_PX = 40;

export function useChatTimelineScroll(options: ChatTimelineScrollOptions = {}): ChatTimelineScrollResult {
  const onScrollTopRef = useRef<(() => void) | undefined>(options.onScrollTop);
  onScrollTopRef.current = options.onScrollTop ?? onScrollTopRef.current;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the viewport is (or should stay) pinned to the tail. A ref, not
  // state: scroll chunks read it every frame and a flip must not re-render.
  const followRef = useRef(true);
  // Previous scrollTop, for upward-scroll detection in handleScroll.
  const lastScrollTopRef = useRef(0);

  const contentRef = useCallback((node: HTMLDivElement | null) => {
    setContentNode(node);
  }, []);

  const syncFollowBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight >= FOLLOW_BOTTOM_THRESHOLD_PX);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      // Disengage only on upward scroll (the user reading back): a decreasing
      // scrollTop is the one signal that separates a user's intent from the
      // programmatic downward scrolls — smooth follow animations produce only
      // increasing scrollTop, so a geometry check alone would flip the flag
      // mid-animation as content outgrows the animation. Re-engage whenever
      // the viewport is back near the tail, whichever way it got there.
      if (el.scrollTop < lastScrollTopRef.current - 1) followRef.current = false;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_BOTTOM_THRESHOLD_PX) followRef.current = true;
      lastScrollTopRef.current = el.scrollTop;
      // History paging: the viewport hit the top — ask for the older window.
      // Idempotent: the loader ignores calls while a page is in flight.
      if (el.scrollTop <= SCROLL_TOP_TRIGGER_PX) onScrollTopRef.current?.();
    }
    syncFollowBottom();
    setIsScrolling(true);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 600);
  }, [syncFollowBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    // Follow-gated: a stream chunk in read mode (user scrolled away) must not
    // yank the viewport down. jumpToBottom is the explicit bypass.
    if (!followRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const jumpToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    followRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
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

  return { scrollRef, contentRef, showScrollBottom, isScrolling, followRef, handleScroll, scrollToBottom, jumpToBottom };
}
