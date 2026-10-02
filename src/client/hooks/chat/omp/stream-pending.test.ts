/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The optimistic `stream` mark: armed on the click by `useOmpPromptSender`,
 * applied to the sidebar's folders by `applyStreamOverlay`, and released the
 * moment an authoritative status arrives (`releaseObservedPending`).
 *
 * The behaviour under test is the click→dispatch window. The chat's own
 * `isGenerating` cannot cover it across a session switch (it lives in a
 * timeline that unmounts) and the server's row does not exist yet, so the
 * sidebar used to lose the spinner for exactly the run the user just started.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import {
  applyStreamOverlay,
  releaseObservedPending,
  setStreamPending,
  STREAM_PENDING_EVENT,
  type StreamPendingDetail,
} from '@/client/hooks/chat/omp/stream-overlay';
import { useOmpPromptSender } from '@/client/hooks/chat/omp/prompt-send';
import type { OmpPromptSender, OmpPromptSenderDeps } from '@/client/hooks/chat/omp/prompt-send';
import { SidebarDataProvider, useSidebarData } from '@/client/hooks/chat/omp/session-list';
import type { SidebarDataHandle } from '@/client/hooks/chat/omp/session-list';
import type { OmpAgentState, WorkspaceFolderData } from '@/shared/types';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'] as const;
/** The runner's own globals, restored on teardown — deleting them would strip natives (Event/CustomEvent) every later file needs. */
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

let container: HTMLElement | undefined;

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
  container = undefined;
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
});

/** Let queued promises (a stubbed fetch, Preact's effects) settle. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

type Status = 'stream' | 'finish' | 'abort';

/** One folder holding the given sessions, shaped only as far as the overlay reads it. */
function folders(sessions: Array<{ id: string; streamStatus?: Status }>): WorkspaceFolderData[] {
  return [{ id: 1, name: 'ws', sessions }] as unknown as WorkspaceFolderData[];
}

describe('applyStreamOverlay', () => {
  test('forces `stream` on a session whose send is still in flight, over a terminal badge', () => {
    // The snapshot still carries the PREVIOUS run's `finish`; the click armed a
    // mark, so the spinner must render anyway.
    const out = applyStreamOverlay(folders([{ id: 'a', streamStatus: 'finish' }]), new Set(), new Map([['a', Date.now()]]));
    expect(out[0].sessions?.[0].streamStatus).toBe('stream');
  });

  test('returns the same array when neither overlay has anything to do', () => {
    const base = folders([{ id: 'a', streamStatus: 'stream' }]);
    expect(applyStreamOverlay(base, new Set(), new Map())).toBe(base);
  });

  test('strips a terminal badge this mount already acked, but never a live `stream` row', () => {
    const out = applyStreamOverlay(
      folders([{ id: 'a', streamStatus: 'finish' }, { id: 'b', streamStatus: 'stream' }]),
      new Set(['a', 'b']),
      new Map(),
    );
    expect(out[0].sessions?.[0].streamStatus).toBeUndefined();
    expect(out[0].sessions?.[1].streamStatus).toBe('stream');
  });
});

describe('releaseObservedPending', () => {
  test('releases a mark once a snapshot that landed after the arm carries any status', () => {
    const pending = new Map([['a', Date.now() - 1_000]]);
    expect(releaseObservedPending(pending, folders([{ id: 'a', streamStatus: 'stream' }]))).toBe(true);
    expect(pending.has('a')).toBe(false);
  });

  test('ignores a snapshot that predates the arm — the previous run’s terminal badge', () => {
    // A clock in the future stands in for "the mark was armed after this data
    // was requested": clearing on it would switch the click's spinner back off
    // during the very round trip the mark exists to cover.
    const pending = new Map([['a', Date.now() + 60_000]]);
    expect(releaseObservedPending(pending, folders([{ id: 'a', streamStatus: 'finish' }]))).toBe(false);
    expect(pending.has('a')).toBe(true);
  });

  test('reports no change for a session with no status to hand over to', () => {
    const pending = new Map([['a', Date.now() - 1_000]]);
    expect(releaseObservedPending(pending, folders([{ id: 'a' }]))).toBe(false);
    expect(pending.has('a')).toBe(true);
  });
});

/** Stub fetch: every request answers `{ success: true }` unless overridden. */
function installFetch(answers: Record<string, { status?: number; body?: unknown }> = {}) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  (globalThis as unknown as Record<string, unknown>).fetch = async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    requests.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
    const answer = answers[url] ?? { body: { success: true } };
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 });
  };
  return requests;
}

function mountSender(sessionId: string | null) {
  const sessionIdRef = { current: sessionId };
  let state: OmpAgentState = { isGenerating: false, connected: false, error: null };
  const deps: OmpPromptSenderDeps = {
    sessionIdRef,
    connect: () => {},
    setState: (next) => { state = typeof next === 'function' ? next(state) : next; },
  };
  const seen: { current: OmpPromptSender | null } = { current: null };
  function Probe() {
    seen.current = useOmpPromptSender(deps);
    return null;
  }
  const el = document.createElement('div');
  document.body.appendChild(el);
  container = el;
  render(h(Probe, null), el);
  return { sender: () => seen.current as OmpPromptSender, state: () => state };
}

/** Every `omp:stream-pending` arm/disarm seen from here on, in order. */
function recordPendingMarks(): StreamPendingDetail[] {
  const marks: StreamPendingDetail[] = [];
  window.addEventListener(STREAM_PENDING_EVENT, (event) => {
    marks.push((event as CustomEvent<StreamPendingDetail>).detail);
  });
  return marks;
}

const SID = 'sess/1';

describe('useOmpPromptSender arms the optimistic mark', () => {
  test('sendPrompt arms on the click and re-arms on the accepted dispatch', async () => {
    installFetch();
    const marks = recordPendingMarks();
    const probe = mountSender(SID);

    expect(await probe.sender().sendPrompt('hello')).toBe(true);

    // Two arms, no disarm: the click covers the round trip, the second moves
    // the clock past the point where an authoritative snapshot can be trusted.
    expect(marks).toEqual([
      { sessionId: SID, pending: true },
      { sessionId: SID, pending: true },
    ]);
  });

  test('sendPrompt disarms when the server refuses the prompt', async () => {
    installFetch({ [`/api/agent/${encodeURIComponent(SID)}`]: { body: { error: 'session_busy' } } });
    const marks = recordPendingMarks();
    const probe = mountSender(SID);

    expect(await probe.sender().sendPrompt('go')).toBe(false);

    // The refused prompt leaves no run behind, so a mark that survived would
    // spin the sidebar forever.
    expect(marks[marks.length - 1]).toEqual({ sessionId: SID, pending: false });
    expect(probe.state().error).toBe('session_busy');
  });

  test('sendNewPrompt arms only once the real session id exists', async () => {
    installFetch({ '/api/agent/new': { body: { success: true, sessionId: 'omp-9' } } });
    const marks = recordPendingMarks();
    const probe = mountSender(null);

    const spawned = await probe.sender().sendNewPrompt('first', '/tmp/ws');

    expect(spawned?.sessionId).toBe('omp-9');
    // Nothing can be armed for a session with no id yet — the pending view owns
    // that span — so no mark may name anything else.
    expect(marks.every((mark) => mark.sessionId === 'omp-9')).toBe(true);
    expect(marks[marks.length - 1]).toEqual({ sessionId: 'omp-9', pending: true });
  });
});

/** A session-list payload carrying one session, `a`, with the given fields. */
function listBody(session: { streamStatus?: Status } = {}): unknown {
  return {
    folders: [{ id: 1, name: 'ws', sessions: [{ id: 'a', folder_id: 1, title: 'A', ...session }] }],
    isMock: false,
  };
}

/** The status the provider currently renders for session `a`. */
function renderedStatus(api: SidebarDataHandle | null): Status | undefined {
  return api?.folders[0]?.sessions?.[0].streamStatus;
}

/** Mount the real provider over a stubbed `/api/sessions/list`. */
async function mountProvider(body: () => unknown) {
  const calls: string[] = [];
  (globalThis as unknown as Record<string, unknown>).fetch = async (input: unknown) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const holder: { api: SidebarDataHandle | null } = { api: null };
  function Probe() {
    holder.api = useSidebarData();
    return null;
  }
  const el = document.createElement('div');
  document.body.appendChild(el);
  container = el;
  await act(async () => {
    render(h(SidebarDataProvider, { children: h(Probe, null) }), el);
    await tick();
  });
  return { calls, holder };
}

describe('SidebarDataProvider renders the armed mark and hands over to the row', () => {
  test('shows `stream` for a click-armed session the loader still reports as idle', async () => {
    const harness = await mountProvider(() => listBody());
    expect(renderedStatus(harness.holder.api)).toBeUndefined();

    await act(async () => {
      setStreamPending('a', true);
    });

    expect(renderedStatus(harness.holder.api)).toBe('stream');
  });

  test('exposes the armed mark, so a placeholder row can paint the spinner', async () => {
    // The sidebar's "New Session …" row is built OUTSIDE the loader's folders,
    // so the overlay cannot reach it: the predicate is the only way that row
    // shows a spinner before the real row is scanned in.
    const harness = await mountProvider(() => listBody());
    expect(harness.holder.api?.isStreamPending('a')).toBe(false);

    await act(async () => {
      setStreamPending('a', true);
    });

    expect(harness.holder.api?.isStreamPending('a')).toBe(true);
    expect(harness.holder.api?.isStreamPending('b')).toBe(false);
    expect(harness.holder.api?.isStreamPending(null)).toBe(false);
  });

  test('hands the session back to the row, and does not pin a finished run', async () => {
    let body = listBody({ streamStatus: 'stream' });
    const harness = await mountProvider(() => body);

    await act(async () => {
      setStreamPending('a', true);
    });
    await act(async () => {
      harness.holder.api?.refresh();
      await tick();
    });
    expect(renderedStatus(harness.holder.api)).toBe('stream');

    // The run ended and the server row was acked away (or never landed): the
    // mark must be gone, or the spinner would turn forever.
    body = listBody();
    await act(async () => {
      harness.holder.api?.refresh();
      await tick();
    });
    expect(renderedStatus(harness.holder.api)).toBeUndefined();
  });

  test('a refresh coalesced behind an in-flight load still runs afterwards', async () => {
    const resolvers: Array<() => void> = [];
    let calls = 0;
    (globalThis as unknown as Record<string, unknown>).fetch = () => {
      calls += 1;
      return new Promise<Response>((resolve) => {
        resolvers.push(() => resolve(new Response(JSON.stringify(listBody()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })));
      });
    };
    const holder: { api: SidebarDataHandle | null } = { api: null };
    function Probe() {
      holder.api = useSidebarData();
      return null;
    }
    const el = document.createElement('div');
    document.body.appendChild(el);
    container = el;
    await act(async () => {
      render(h(SidebarDataProvider, { children: h(Probe, null) }), el);
      await tick();
    });
    expect(calls).toBe(1);

    // Two refreshes land while the mount's load is still in flight. They must
    // coalesce into ONE trailing load — neither vanish (the send's live row is
    // what such a refresh carries) nor duplicate.
    await act(async () => {
      holder.api?.refresh();
      holder.api?.refresh();
    });
    expect(calls).toBe(1);

    await act(async () => {
      resolvers[0]();
      await tick();
    });
    expect(calls).toBe(2);
  });
});
