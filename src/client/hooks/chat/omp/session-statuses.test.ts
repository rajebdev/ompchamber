/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The sidebar/navbar live-status cluster: `session-statuses`, `stream-poll`,
 * `revalidation-throttle` and `status`.
 *
 * These four small modules are the only wiring between a server-tracked run
 * state and the pixels the user watches, so each case pins a way the UI could
 * silently disagree with reality:
 *
 * - `isSessionStreaming` is the EXACT `streamStatus === 'stream'` test the
 *   sidebar spinner and the timeline's generating indicator share; a second
 *   tab or a background process must still light the spinner, while a stale
 *   `finish`/`abort` badge must not.
 * - `useSessionStatusAck` must POST exactly once per (session, status) so the
 *   one-shot terminal check cannot flicker, and must never ack a live row.
 * - `useStreamPoll` must revalidate only while something actually streams —
 *   a stale snapshot keeping the timer hot is a background request leak.
 * - `useSidebarRevalidation` is a LEADING+trailing throttle, not a debounce:
 *   the first event of a quiet period must land immediately or a spawn feels
 *   frozen, and a 250ms burst must collapse instead of revalidating per frame.
 * - `useAgentStreamStatus` seeds from the last published value so a navbar
 *   mounted mid-run paints the current transport instead of waiting.
 *
 * Rendered with `h()` against happy-dom, the way the other hook tests do.
 */

import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import {
  buildSidebarSessionStatus,
  isSessionStreaming,
  useSessionStatusAck,
} from '@/client/hooks/chat/omp/session-statuses';
import { useStreamPoll } from '@/client/hooks/chat/omp/stream-poll';
import { useSidebarRevalidation } from '@/client/hooks/chat/omp/revalidation-throttle';
import { useAgentStreamStatus } from '@/client/hooks/chat/omp/status';
import {
  SIDEBAR_REVALIDATE_THROTTLE_MS,
  SIDEBAR_STREAM_POLL_MS,
} from '@/shared/lib/workspace/refresh-cadence';
import type { SessionItemData } from '@/shared/types';
import { AGENT_STREAM_STATUS_EVENT, publishAgentStreamStatus, type AgentStreamStatus } from '@/shared/lib/chat/omp/status';
import { DEFAULT_STREAM_TRANSPORT } from '@/shared/lib/chat/omp/transport';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'] as const;
/** The runner's own globals, restored on teardown (see the matching afterAll at the end of this file) so later files still see native Event/CustomEvent/window. */
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};
/** The runner's own fetch — `installFetch` replaces it for the whole process. */
/** The runner's own fetch, reached through `Bun` so a stub leaked onto the global cannot be mistaken for it. */
const nativeFetch = Bun.fetch;

let container: HTMLElement;

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
});

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  jest.useRealTimers();
  // `installFetch` replaces the global for the WHOLE process; left in place it
  // answers every later suite's requests with this file's `{deleted}` body
  // (measured: `listPlugins` read `[]`, every live-listener probe read `null`).
  globalThis.fetch = nativeFetch;
  // The status store is module state too: a suite that asserts the pristine
  // seed must not read this file's `sse` transition.
  publishAgentStreamStatus({ transport: DEFAULT_STREAM_TRANSPORT, connected: false });
});

async function mount(vnode: Parameters<typeof render>[0]) {
  container ??= document.body.appendChild(document.createElement('div'));
  await act(async () => {
    render(vnode, container as HTMLElement);
  });
}

/** Drain the promise chain a stubbed `fetch` starts (no timers involved). */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** One sidebar row, so every fixture below agrees on the item shape. */
function session(id: number | string, streamStatus?: SessionItemData['streamStatus']): SessionItemData {
  const item: SessionItemData = { id, folder_id: 1, title: `s-${id}` };
  if (streamStatus !== undefined) item.streamStatus = streamStatus;
  return item;
}

describe('buildSidebarSessionStatus', () => {
  test('keys only sessions carrying a status, by stringified id', () => {
    const map = buildSidebarSessionStatus([
      { sessions: [session(7, 'stream'), session('abc', 'finish'), session(8)] },
    ]);
    expect(map).toEqual({ '7': 'stream', abc: 'finish' });
  });

  test('walks every folder and lets the last duplicate id win', () => {
    const map = buildSidebarSessionStatus([
      { sessions: [session(1, 'finish')] },
      { sessions: [session(1, 'abort')] },
      { sessions: undefined },
    ]);
    expect(map['1']).toBe('abort');
  });
});

describe('isSessionStreaming', () => {
  const folders = [{ sessions: [session('a', 'stream'), session('b', 'finish'), session('c', 'abort'), session(4, 'stream')] }];

  test('is true only for the exact `stream` status, across id shapes', () => {
    expect(isSessionStreaming(folders, 'a')).toBe(true);
    expect(isSessionStreaming(folders, 4)).toBe(true);
    expect(isSessionStreaming(folders, '4')).toBe(true);
    expect(isSessionStreaming(folders, 'b')).toBe(false);
    expect(isSessionStreaming(folders, 'c')).toBe(false);
  });

  test('is false for a session absent from every folder', () => {
    expect(isSessionStreaming(folders, 'missing')).toBe(false);
    expect(isSessionStreaming([], 'a')).toBe(false);
  });

  test('is false for a null/undefined selection (nothing is open yet)', () => {
    expect(isSessionStreaming(folders, null)).toBe(false);
    expect(isSessionStreaming(folders, undefined)).toBe(false);
  });
});

interface AckApi {
  statusMap: Record<string, 'stream' | 'finish' | 'abort'>;
  activeSessionId: string | null;
  skip?: (id: number | string) => boolean;
}

describe('useSessionStatusAck', () => {
  const calls: Array<{ url: string; method: string }> = [];
  let revalidated = 0;
  let deleted = true;

  function installFetch() {
    calls.length = 0;
    revalidated = 0;
    deleted = true;
    (globalThis as unknown as Record<string, unknown>).fetch = async (input: unknown, init?: { method?: string }) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify({ deleted }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  }

  function Probe({ api }: { api: AckApi }) {
    useSessionStatusAck(api.statusMap, api.activeSessionId, () => { revalidated += 1; }, api.skip);
    return null;
  }

  test('acks a terminal badge for the open session exactly once, then revalidates', async () => {
    installFetch();
    const api: AckApi = { statusMap: { s1: 'finish' }, activeSessionId: 's1' };
    await mount(h(Probe, { api }));
    await settle();

    expect(calls).toEqual([{ url: '/api/sessions/s1/stream-seen', method: 'POST' }]);
    expect(revalidated).toBe(1);

    // Re-render with an identical map: the effect must not re-POST.
    await act(async () => { render(h(Probe, { api }), container as HTMLElement); });
    await settle();
    expect(calls.length).toBe(1);
  });

  test('never acks a live `stream` row', async () => {
    installFetch();
    await mount(h(Probe, { api: { statusMap: { s1: 'stream' }, activeSessionId: 's1' } }));
    await settle();
    expect(calls.length).toBe(0);
  });

  test('honours skip() so a click-acked badge is not double-POSTed', async () => {
    installFetch();
    await mount(h(Probe, { api: { statusMap: { s1: 'abort' }, activeSessionId: 's1', skip: () => true } }));
    await settle();
    expect(calls.length).toBe(0);
    expect(revalidated).toBe(0);
  });

  test('does nothing with no open session', async () => {
    installFetch();
    await mount(h(Probe, { api: { statusMap: { s1: 'finish' }, activeSessionId: null } }));
    await settle();
    expect(calls.length).toBe(0);
  });
});

describe('useStreamPoll', () => {
  function PollProbe({ status, onTick }: { status: Record<string, 'stream' | 'finish' | 'abort'>; onTick: () => void }) {
    useStreamPoll(status, onTick);
    return null;
  }

  test('revalidates on every tick while a session streams', async () => {
    jest.useFakeTimers();
    let ticks = 0;
    await mount(h(PollProbe, { status: { s1: 'stream' }, onTick: () => { ticks += 1; } }));

    await act(async () => { jest.advanceTimersByTime(SIDEBAR_STREAM_POLL_MS); });
    expect(ticks).toBe(1);
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_STREAM_POLL_MS); });
    expect(ticks).toBe(2);
  });

  test('stays silent when nothing is streaming', async () => {
    jest.useFakeTimers();
    let ticks = 0;
    await mount(h(PollProbe, { status: { s1: 'finish' }, onTick: () => { ticks += 1; } }));
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_STREAM_POLL_MS * 3); });
    expect(ticks).toBe(0);
  });

  test('reads the LIVE status each tick, not the one captured at mount', async () => {
    jest.useFakeTimers();
    let ticks = 0;
    const onTick = () => { ticks += 1; };
    await mount(h(PollProbe, { status: { s1: 'finish' }, onTick }));
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_STREAM_POLL_MS); });
    expect(ticks).toBe(0);

    await act(async () => { render(h(PollProbe, { status: { s1: 'stream' }, onTick }), container as HTMLElement); });
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_STREAM_POLL_MS); });
    expect(ticks).toBe(1);
  });

  test('stops polling after unmount', async () => {
    jest.useFakeTimers();
    let ticks = 0;
    await mount(h(PollProbe, { status: { s1: 'stream' }, onTick: () => { ticks += 1; } }));
    render(null, container as HTMLElement);
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_STREAM_POLL_MS * 2); });
    expect(ticks).toBe(0);
  });
});

describe('useSidebarRevalidation', () => {
  function RevalidateProbe({ onRevalidate }: { onRevalidate: () => void }) {
    useSidebarRevalidation(onRevalidate);
    return null;
  }

  test('fires the leading edge immediately, then collapses a burst into one trailing call', async () => {
    jest.useFakeTimers();
    let calls = 0;
    await mount(h(RevalidateProbe, { onRevalidate: () => { calls += 1; } }));

    await act(async () => { window.dispatchEvent(new CustomEvent('omp:session-updated')); });
    expect(calls).toBe(1);

    // Two more events inside the window: neither may revalidate yet.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('omp:session-updated'));
      window.dispatchEvent(new CustomEvent('omp:session-updated'));
    });
    expect(calls).toBe(1);
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_REVALIDATE_THROTTLE_MS); });
    expect(calls).toBe(2);
  });

  test('an event past the window revalidates immediately, not after a delay', async () => {
    jest.useFakeTimers();
    let calls = 0;
    await mount(h(RevalidateProbe, { onRevalidate: () => { calls += 1; } }));

    await act(async () => { window.dispatchEvent(new CustomEvent('omp:session-updated')); });
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_REVALIDATE_THROTTLE_MS); });
    await act(async () => { window.dispatchEvent(new CustomEvent('omp:session-updated')); });
    expect(calls).toBe(2);
  });

  test('unmount cancels a pending trailing call', async () => {
    jest.useFakeTimers();
    let calls = 0;
    await mount(h(RevalidateProbe, { onRevalidate: () => { calls += 1; } }));
    await act(async () => { window.dispatchEvent(new CustomEvent('omp:session-updated')); });
    await act(async () => { window.dispatchEvent(new CustomEvent('omp:session-updated')); });
    render(null, container as HTMLElement);
    await act(async () => { jest.advanceTimersByTime(SIDEBAR_REVALIDATE_THROTTLE_MS); });
    expect(calls).toBe(1);
  });
});

describe('useAgentStreamStatus', () => {
  function StatusProbe({ seen }: { seen: { current: AgentStreamStatus | null } }) {
    seen.current = useAgentStreamStatus();
    return null;
  }

  test('seeds from the last published status, so a mid-run mount is not blank', async () => {
    publishAgentStreamStatus({ transport: 'sse', connected: true });
    const seen: { current: AgentStreamStatus | null } = { current: null };
    await mount(h(StatusProbe, { seen }));
    expect(seen.current).toEqual({ transport: 'sse', connected: true });
  });

  test('follows published transitions and ignores a detail-less event', async () => {
    publishAgentStreamStatus({ transport: 'sse', connected: false });
    const seen: { current: AgentStreamStatus | null } = { current: null };
    await mount(h(StatusProbe, { seen }));

    await act(async () => { publishAgentStreamStatus({ transport: 'websocket', connected: true }); });
    expect(seen.current).toEqual({ transport: 'websocket', connected: true });

    const before = seen.current;
    await act(async () => { window.dispatchEvent(new CustomEvent(AGENT_STREAM_STATUS_EVENT)); });
    expect(seen.current).toBe(before);
  });
});

afterAll(() => {
  globalThis.fetch = nativeFetch;
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
});
