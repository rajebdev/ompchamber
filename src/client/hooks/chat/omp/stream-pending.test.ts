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

import {
  applyStreamOverlay,
  releaseObservedPending,
  STREAM_PENDING_SIGNAL,
  type StreamPendingDetail,
} from '@/client/hooks/chat/omp/stream-overlay';
import { subscribeClientSignal } from '@/client/lib/signals';
import { installDomGlobals, restoreDomGlobals } from '@/test-support/pristine-globals';
import { useOmpPromptSender } from '@/client/hooks/chat/omp/prompt-send';
import type { OmpPromptSender, OmpPromptSenderDeps } from '@/client/hooks/chat/omp/prompt-send';
import type { OmpAgentState, WorkspaceFolderData } from '@/shared/types';


let container: HTMLElement | undefined;

beforeAll(() => {
  installDomGlobals(new Window({ url: 'http://localhost' }));
});

afterAll(() => {
  restoreDomGlobals();
});



afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  container = undefined;
});



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

/** Every stream-pending arm/disarm seen from here on, in order. */
function recordPendingMarks(): StreamPendingDetail[] {
  const marks: StreamPendingDetail[] = [];
  subscribeClientSignal(STREAM_PENDING_SIGNAL, (detail) => {
    marks.push(detail);
  });
  return marks;
}

const SID = 'sess/1';

describe('useOmpPromptSender arms the optimistic mark', () => {
  test('sendPrompt arms on the click and re-arms on the accepted dispatch', async () => {
    installFetch();
    const marks = recordPendingMarks();
    const probe = mountSender(SID);

    expect((await probe.sender().sendPrompt('hello')).ok).toBe(true);

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

    expect((await probe.sender().sendPrompt('go')).ok).toBe(false);

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
