/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The timeline's two scroll/index behaviours, both of which are about a WINDOW
 * of a long session rather than about the messages on screen:
 *
 * - The jump rail lists the FULL session's user turns (`/api/chat/:id/turns`),
 *   because the mounted window holds only the newest slice. Live rows the
 *   committed index does not carry yet (an optimistic send) are appended with
 *   `index: -1` — dropping them would make the rail lag one turn behind the
 *   composer, and asking the pager to reach them would page history for a row
 *   that is already on screen. Until the index lands the mounted rows ARE the
 *   rail, so a chat that already shows turns never renders an empty one.
 * - Opening a session jumps to its tail exactly ONCE, on the commit where that
 *   session's messages appear — not on the commit where the id flips, where the
 *   DOM still holds the previous session's rows — and the jump is the
 *   unconditional `jumpToBottom('instant')` rather than the follow-gated one,
 *   because follow mode belongs to this mounted view, not to the session.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useUserTurns, type UserTurnsState } from '@/client/hooks/chat/timeline/user-turns';
import { useTimelineAutoScroll } from '@/client/hooks/chat/timeline/auto-scroll';
import { TURN_PREVIEW_CHARS } from '@/shared/lib/chat/timeline/turns';
import type { ChatMessageData } from '@/shared/types';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'] as const;
/** The runner's own globals, restored on teardown so later files still have them. */
const native: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

const originalFetch = globalThis.fetch;
let container: HTMLElement | undefined;

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in native)) native[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (native[key] === undefined) delete target[key];
    else target[key] = native[key];
  }
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  globalThis.fetch = originalFetch;
  delete (document as unknown as Record<string, unknown>).getElementById;
});

async function drain(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await act(async () => {});
}

/** Timeline rows in this file are only ever user prompts; the builder exists so
 *  every case states which turn it is about, not how a row is shaped. */
function userMessage(id: string, content: string): ChatMessageData {
  return { id, role: 'user', content };
}

describe('useUserTurns', () => {
  let rail: UserTurnsState | undefined;
  const turnsRequests: string[] = [];
  const scrolled: string[] = [];
  let committed: { turns?: unknown } | null = { turns: [] };

  function RailProbe({ sessionId, messages, jumpToTurn }: {
    sessionId: string | null;
    messages: ChatMessageData[];
    jumpToTurn: (id: string, index: number) => Promise<boolean>;
  }) {
    rail = useUserTurns({ sessionId, messages, jumpToTurn });
    return null;
  }

  beforeEach(() => {
    rail = undefined;
    turnsRequests.length = 0;
    scrolled.length = 0;
    committed = { turns: [] };
    globalThis.fetch = (async (input: unknown) => {
      turnsRequests.push(String(input));
      if (committed === null) return new Response('no', { status: 500 });
      return new Response(JSON.stringify(committed), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    (document as unknown as Record<string, unknown>).getElementById = () => ({
      scrollIntoView: (opts: unknown) => { scrolled.push(JSON.stringify(opts)); },
    });
  });

  async function open(sessionId: string | null, messages: ChatMessageData[], jumpToTurn = async () => true): Promise<void> {
    container ??= document.body.appendChild(document.createElement('div'));
    await act(async () => { render(h(RailProbe, { sessionId, messages, jumpToTurn }), container as HTMLElement); });
    await drain();
  }

  test('the mounted rows are the rail until the committed index lands', async () => {
    const long = 'x'.repeat(TURN_PREVIEW_CHARS + 50);
    committed = { turns: [] };
    await open('s1', [userMessage('u1', long), { id: 'a1', role: 'ai', content: 'hi' }]);
    expect(turnsRequests).toEqual(['/api/chat/s1/turns']);
    expect(rail?.turns).toEqual([
      { id: 'u1', index: -1, preview: long.slice(0, TURN_PREVIEW_CHARS), date: undefined, timestamp: undefined },
    ]);
  });

  test('the committed index is used and a live row it does not carry is appended', async () => {
    committed = { turns: [{ id: 'u1', index: 0, preview: 'old' }] };
    await open('s1', [userMessage('u1', 'old'), userMessage('u2', 'live')]);
    expect(rail?.turns.map((turn) => turn.id)).toEqual(['u1', 'u2']);
    expect(rail?.turns[1].index).toBe(-1);
  });

  test('a row the index already carries is not duplicated', async () => {
    committed = { turns: [{ id: 'u1', index: 4, preview: 'old' }] };
    await open('s1', [userMessage('u1', 'old')]);
    expect(rail?.turns).toHaveLength(1);
    expect(rail?.turns[0].index).toBe(4);
  });

  test('a failed index read leaves the mounted rows standing', async () => {
    committed = null;
    await open('s1', [userMessage('u1', 'kept')]);
    expect(rail?.turns.map((turn) => turn.id)).toEqual(['u1']);
  });

  test('a pending chat never asks for a turn index', async () => {
    await open('new-1790756769131', [userMessage('u1', 'kept')]);
    expect(turnsRequests).toEqual([]);
    expect(rail?.turns.map((turn) => turn.id)).toEqual(['u1']);
  });

  test('a jump to a live row scrolls it without paging', async () => {
    let paged = 0;
    await open('s1', [userMessage('u1', 'x')], async () => { paged += 1; return true; });
    let reached = false;
    await act(async () => { reached = await rail!.jumpToTurn('u1', -1); });
    expect(reached).toBe(true);
    expect(paged).toBe(0);
    expect(scrolled).toEqual([JSON.stringify({ behavior: 'smooth', block: 'center' })]);
  });

  test('a jump that pages scrolls only when the row was reached', async () => {
    await open('s1', [userMessage('u1', 'x')], async () => false);
    let reached = true;
    await act(async () => { reached = await rail!.jumpToTurn('u9', 3); });
    expect(reached).toBe(false);
    expect(scrolled).toEqual([]);
    expect(rail?.jumping).toBe(false);
  });
});

describe('useTimelineAutoScroll', () => {
  const jumps: (ScrollBehavior | undefined)[] = [];
  const scrollRef = { current: {} as HTMLDivElement };
  const record = (behavior?: ScrollBehavior): void => { jumps.push(behavior); };

  function ScrollProbe({ sessionId, messages, enabled }: {
    sessionId: string | null;
    messages: ChatMessageData[];
    enabled: boolean;
  }) {
    useTimelineAutoScroll({ sessionId, messages, scrollRef, jumpToBottom: record, enabled });
    return null;
  }

  beforeEach(() => { jumps.length = 0; });

  async function paint(sessionId: string | null, messages: ChatMessageData[], enabled = true): Promise<void> {
    container ??= document.body.appendChild(document.createElement('div'));
    await act(async () => { render(h(ScrollProbe, { sessionId, messages, enabled }), container as HTMLElement); });
    await drain();
  }

  test('the commit that flips the session id does not jump', async () => {
    await paint('s1', [userMessage('u1', 'x')]);
    expect(jumps).toEqual([]);
  });

  test('the commit where the session messages land jumps to the tail once', async () => {
    await paint('s1', []);
    expect(jumps).toEqual([]);
    await paint('s1', [userMessage('u1', 'x')]);
    expect(jumps).toEqual(['instant']);
  });

  test('later commits of the same session do not jump again', async () => {
    await paint('s1', []);
    await paint('s1', [userMessage('u1', 'x')]);
    await paint('s1', [userMessage('u1', 'x'), userMessage('u2', 'y')]);
    expect(jumps).toEqual(['instant']);
  });

  test('a disabled view never jumps', async () => {
    await paint('s1', [], false);
    await paint('s1', [userMessage('u1', 'x')], false);
    expect(jumps).toEqual([]);
  });

  test('switching sessions serves the new session its own opening jump', async () => {
    await paint('s1', []);
    await paint('s1', [userMessage('u1', 'x')]);
    await paint('s2', [userMessage('u1', 'x')]);
    expect(jumps).toEqual(['instant']);
    await paint('s2', [userMessage('u1', 'x'), userMessage('u2', 'y')]);
    expect(jumps).toEqual(['instant', 'instant']);
  });
});
