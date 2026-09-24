/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chat timeline scroll contract. Both behaviours here were the bug:
 *
 * 1. The jump that follows a session's committed history used the follow-gated
 *    `scrollToBottom`, and follow mode belongs to the mounted view, not to the
 *    session being opened — a user who scrolled up before switching left it
 *    disengaged, so the newly opened session painted at `scrollTop = 0` with no
 *    scroll event to re-engage it and stayed there. Verified live in the
 *    chamber: scroll up in session A, open session B, viewport pinned at the
 *    head with the jump button showing until it was clicked.
 * 2. Nothing re-pinned the tail when content grew while the viewport was
 *    pinned (a prepended window, a late Shiki/mermaid/image layout), so a jump
 *    target measured a frame earlier — or at open time — was stranded.
 *
 * Runs against a real DOM (happy-dom) because these are Preact hooks; geometry
 * is faked on the container, since happy-dom does no layout.
 */

import { afterAll, beforeAll, describe, expect, jest as fakeTimers, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { h as PreactH, render as PreactRender } from 'preact';
import type { act as PreactAct } from 'preact/test-utils';
import type { useChatTimelineScroll as UseScroll, ChatTimelineScrollResult } from '@/client/hooks/chat/timeline/scroll';
import type { useTimelineAutoScroll as UseAuto } from '@/client/hooks/chat/timeline/auto-scroll';
import type { ChatMessageData } from '@/shared/types';

let useChatTimelineScroll: typeof UseScroll;
let useTimelineAutoScroll: typeof UseAuto;
let h: typeof PreactH;
let render: typeof PreactRender;
let act: typeof PreactAct;

let win: Window;
const scrolled: Array<{ top: number; behavior?: ScrollBehavior }> = [];
const geometry = { top: 0, height: 5000, viewport: 500 };

/** Observe what the hook asks for; 'instant' also lands (a smooth scroll would
 *  animate in a browser, so the fake keeps it as a recorded intent only). */
function applyTop(el: HTMLDivElement, value: number) {
  geometry.top = Math.max(0, Math.min(value, geometry.height - geometry.viewport));
  // The global `Event` the hook's listener expects: happy-dom's, installed
  // into globalThis in beforeAll.
  el.dispatchEvent(new Event('scroll'));
}

function installScroller(el: HTMLDivElement) {
  Object.defineProperty(el, 'scrollHeight', { get: () => geometry.height, configurable: true });
  Object.defineProperty(el, 'clientHeight', { get: () => geometry.viewport, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    get: () => geometry.top,
    set: (value: number) => applyTop(el, value),
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTo', {
    value: (options: { top: number; behavior?: ScrollBehavior }) => {
      scrolled.push(options);
      if (options.behavior !== 'smooth') applyTop(el, options.top);
    },
    configurable: true,
  });
}

/** ResizeObserver the tests drive by hand — the hook rebuilds one per content
 *  node, so the last instance of the current mount is the live one. */
class StubResizeObserver {
  static instances: StubResizeObserver[] = [];
  static latest(): StubResizeObserver { return StubResizeObserver.instances[StubResizeObserver.instances.length - 1]; }
  constructor(private readonly callback: () => void) {
    StubResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  fire() { this.callback(); }
}

interface ProbeProps {
  sessionId: string;
  messages: ChatMessageData[];
  /** Holder owned by ONE test: a stale tree can only write its own hook result. */
  holder: { current: ChatTimelineScrollResult | null };
}

function Probe(props: ProbeProps) {
  const scroll = useChatTimelineScroll({});
  useTimelineAutoScroll({
    sessionId: props.sessionId,
    messages: props.messages,
    scrollRef: scroll.scrollRef,
    jumpToBottom: scroll.jumpToBottom,
    enabled: true,
  });
  props.holder.current = scroll;
  return h('div', { ref: scroll.scrollRef, onScroll: scroll.handleScroll },
    h('div', { ref: scroll.contentRef }));
}

interface ProbeHandle {
  holder: { current: ChatTimelineScrollResult | null };
  node: HTMLDivElement;
  el: HTMLDivElement;
}

const message = (id: string) => ({ id, role: 'user', content: id } as unknown as ChatMessageData);

/** Fresh mount, own container: `follow`, the jump counter and the observers are
 *  per-hook state, so sharing them across tests would hide the behaviour. */
async function mountProbe(sessionId: string, messages: ChatMessageData[]): Promise<ProbeHandle> {
  const holder: ProbeHandle['holder'] = { current: null };
  const node = document.createElement('div');
  document.body.appendChild(node);
  await act(async () => { render(h(Probe, { sessionId, messages, holder }), node); });
  const el = holder.current!.scrollRef.current!;
  installScroller(el);
  return { holder, node, el };
}

/** Re-render with new props: a session switch, then that session's history. */
async function updateProbe(probe: ProbeHandle, sessionId: string, messages: ChatMessageData[]) {
  await act(async () => {
    render(h(Probe, { sessionId, messages, holder: probe.holder }), probe.node);
  });
}

async function unmountProbe(probe: ProbeHandle) {
  await act(async () => { render(null, probe.node); });
  probe.node.remove();
}

beforeAll(async () => {
  win = new Window({ url: 'http://localhost' });
  for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event'] as const) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
  (globalThis as Record<string, unknown>).ResizeObserver = StubResizeObserver;
  // Static imports cannot work here: Preact binds its environment at module
  // evaluation time, so the modules below must load after those DOM globals.
  ({ useChatTimelineScroll } = await import('@/client/hooks/chat/timeline/scroll'));
  ({ useTimelineAutoScroll } = await import('@/client/hooks/chat/timeline/auto-scroll'));
  ({ h, render } = await import('preact'));
  ({ act } = await import('preact/test-utils'));
});

afterAll(() => {
  for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'ResizeObserver']) {
    delete (globalThis as Record<string, unknown>)[key];
  }
});

describe('timeline scroll', () => {
  test('opening a session jumps to the tail even after the user scrolled up', async () => {
    scrolled.length = 0;
    geometry.top = 0;
    geometry.height = 5000;
    const probe = await mountProbe('a', [message('a1')]);
    const scroll = () => probe.holder.current!;

    await updateProbe(probe, 'a', [message('a1'), message('a2')]);
    expect(probe.el.scrollTop).toBe(geometry.height - geometry.viewport);

    // The user reads back — follow disengages, and that state outlives the
    // session it was set in.
    probe.el.scrollTop = 100;
    expect(scroll().followRef.current).toBe(false);

    // Session switch: the container paints empty first (the skeleton), the
    // committed history lands a commit later.
    await updateProbe(probe, 'b', []);
    scrolled.length = 0;
    await updateProbe(probe, 'b', [message('b1')]);

    expect(scroll().followRef.current).toBe(true);
    expect(scrolled.length).toBe(1);
    expect(scrolled[0].behavior).toBe('instant');
    expect(scrolled[0].top).toBe(geometry.height);
    expect(probe.el.scrollTop).toBe(geometry.height - geometry.viewport);
    await unmountProbe(probe);
  });

  test('a stream chunk may not move an unpinned viewport, a jump may', async () => {
    scrolled.length = 0;
    geometry.top = 0;
    geometry.height = 5000;
    const probe = await mountProbe('a', [message('a1')]);
    const scroll = () => probe.holder.current!;

    await act(async () => { scroll().jumpToBottom('instant'); });
    expect(scroll().followRef.current).toBe(true);
    expect(probe.el.scrollTop).toBe(geometry.height - geometry.viewport);
    expect(scroll().jumpCountRef.current).toBe(1);
    expect(scroll().jumpActiveRef.current).toBe(true);

    // The user reads back. A stream chunk must not yank the viewport down...
    probe.el.scrollTop = 100;
    expect(scroll().followRef.current).toBe(false);
    scrolled.length = 0;
    await act(async () => { scroll().scrollToBottom('smooth'); });
    expect(scrolled.length).toBe(0);

    // ...while the explicit jump bypasses the gate and re-engages it.
    await act(async () => { scroll().jumpToBottom('instant'); });
    expect(scrolled.length).toBe(1);
    expect(scroll().followRef.current).toBe(true);
    expect(probe.el.scrollTop).toBe(geometry.height - geometry.viewport);
    expect(scroll().jumpCountRef.current).toBe(2);
    await unmountProbe(probe);
  });

  test('the jump guard releases so history paging is not blocked for good', async () => {
    scrolled.length = 0;
    geometry.top = 0;
    geometry.height = 5000;
    const probe = await mountProbe('a', [message('a1')]);
    const scroll = () => probe.holder.current!;

    fakeTimers.useFakeTimers();
    await act(async () => { scroll().jumpToBottom('instant'); });
    expect(scroll().jumpActiveRef.current).toBe(true);

    await act(async () => { fakeTimers.advanceTimersByTime(1000); });
    expect(scroll().jumpActiveRef.current).toBe(false);
    fakeTimers.useRealTimers();
    await unmountProbe(probe);
  });

  test('content growing while pinned re-pins the tail; while reading it does not', async () => {
    scrolled.length = 0;
    geometry.top = 0;
    geometry.height = 5000;
    const probe = await mountProbe('a', [message('a1')]);
    const scroll = () => probe.holder.current!;

    await updateProbe(probe, 'a', [message('a1')]);
    expect(probe.el.scrollTop).toBe(geometry.height - geometry.viewport);

    // A prepended window / a late layout: the tail moved down by 800px.
    geometry.height += 800;
    const observer = StubResizeObserver.latest();
    scrolled.length = 0;
    await act(async () => { observer.fire(); });
    expect(scrolled.length).toBe(1);
    expect(scrolled[0].behavior).toBe('instant');
    expect(probe.el.scrollTop).toBe(geometry.height - geometry.viewport);

    // Reading back: the same growth must leave the viewport alone.
    probe.el.scrollTop = 400;
    scrolled.length = 0;
    geometry.height += 800;
    await act(async () => { StubResizeObserver.latest().fire(); });
    expect(scrolled.length).toBe(0);
    expect(probe.el.scrollTop).toBe(400);
    expect(scroll().followRef.current).toBe(false);
    await unmountProbe(probe);
  });
});
