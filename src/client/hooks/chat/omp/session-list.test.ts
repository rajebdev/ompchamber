/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The mounted `SidebarDataProvider` — the half of the optimistic `stream`
 * overlay that only a real render can exercise: the mark arming, the hand-over
 * to the loader's own row, the title hint, and the coalesced refresh.
 *
 * Split from `stream-pending.test.ts` (which owns the pure overlay functions
 * and the sender's arm/disarm calls) to keep both files under the repo's
 * per-file size ceiling. The DOM bootstrap is duplicated deliberately: each
 * file runs in its own module registry, so sharing it would mean a shared
 * mutable global.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import {
  SESSION_TITLE_HINT_EVENT,
  setStreamPending,
  type SessionTitleHintDetail,
} from '@/client/hooks/chat/omp/stream-overlay';
import { SidebarDataProvider, useSidebarData } from '@/client/hooks/chat/omp/session-list';
import type { SidebarDataHandle } from '@/client/hooks/chat/omp/session-list';

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

/** Let queued promises (a stubbed fetch's `Response.json()` chain, Preact's
 *  effects) settle. A microtask drain, not a delay: nothing here is waiting on
 *  a duration, and `act` already flushes the effects. */
const tick = () => Promise.resolve().then(() => Promise.resolve());

type Status = 'stream' | 'finish' | 'abort';

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

  test('a run that ENDS clears the mark even while the session is still absent from the list', async () => {
    // The fresh-spawn case this exists for: omp creates the session file only
    // when the first assistant message settles (~17s), so until then the loader
    // answers NO row for the session and no snapshot can release the mark. The
    // chat's own run end is the only signal that arrives, and without it the
    // spinner outlived the finished run by up to a full list refresh.
    const harness = await mountProvider(() => listBody());

    await act(async () => {
      setStreamPending('omp-1', true);
    });
    expect(harness.holder.api?.isStreamPending('omp-1')).toBe(true);

    await act(async () => {
      setStreamPending('omp-1', false);
    });
    expect(harness.holder.api?.isStreamPending('omp-1')).toBe(false);
  });

  test('a refresh coalesced behind an in-flight load still runs afterwards', async () => {
    const resolvers: Array<() => void> = [];
    let calls = 0;
    (globalThis as unknown as Record<string, unknown>).fetch = () => {
      calls += 1;
      const { promise, resolve } = Promise.withResolvers<Response>();
      resolvers.push(() => resolve(new Response(JSON.stringify(listBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })));
      return promise;
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

describe('SidebarDataProvider carries the sent text for a placeholder row', () => {
  /** Fire the hint the send path dispatches for a session omp has not scanned. */
  function hint(sessionId: string, title: string): void {
    window.dispatchEvent(new CustomEvent<SessionTitleHintDetail>(SESSION_TITLE_HINT_EVENT, {
      detail: { sessionId, title },
    }));
  }

  test('exposes the text the user just sent, by session id', async () => {
    const harness = await mountProvider(() => listBody());
    expect(harness.holder.api?.titleHint('omp-1')).toBeUndefined();

    await act(async () => {
      hint('omp-1', 'Perbaiki tombol stop');
    });

    expect(harness.holder.api?.titleHint('omp-1')).toBe('Perbaiki tombol stop');
    expect(harness.holder.api?.titleHint('omp-2')).toBeUndefined();
    expect(harness.holder.api?.titleHint(null)).toBeUndefined();
  });

  test('ignores a blank hint and drops one once omp lists the session', async () => {
    const harness = await mountProvider(() => listBody());
    await act(async () => {
      hint('a', '   ');
    });
    expect(harness.holder.api?.titleHint('a')).toBeUndefined();

    await act(async () => {
      hint('a', 'sent text');
    });
    expect(harness.holder.api?.titleHint('a')).toBe('sent text');

    // The real row exists now, so the placeholder is not drawn and the hint has
    // nothing left to stand in for.
    await act(async () => {
      harness.holder.api?.refresh();
      await tick();
    });
    expect(harness.holder.api?.titleHint('a')).toBeUndefined();
  });
});
