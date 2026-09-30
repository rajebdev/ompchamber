/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The composer's mode hydration, and the rule that a session never wears
 * another session's modes.
 *
 * The mode record is read per session (`GET /api/sessions/:id/modes`), and the
 * read FAILS for a session with no file — a pending `new-…` chat, a deleted
 * one: the route answers 404. Keeping the previous answer there meant the goal
 * strip rendered the last chat's objective over a chat that has no goal at all,
 * and the Goal button stayed pressed for a mode this session is not in.
 *
 * Rendered with `h()` (no JSX) against happy-dom, the same way
 * `ModeToggles.test.ts` and `GoalBanner.test.ts` do.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useChatTimelineModes } from '@/client/hooks/chat/timeline/modes';
import { GoalBanner } from '@/client/components/workspace/chat-timeline/chat-input/GoalBanner';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'] as const;

const WITH_GOAL = 'session-with-goal';
/** A live goal whose loop has NOT reported a verdict — the state in which the
 *  evaluating frame is the only activity to show. */
const LIVE_GOAL = 'session-live-goal';
const WITHOUT_FILE = 'new-1790756769131';

let container: HTMLElement | undefined;

/** The composer's own gate: the strip exists while the chat is in goal mode. */
function Probe({ sessionId }: { sessionId: string }) {
  const modes = useChatTimelineModes(sessionId);
  return h(
    'div',
    { id: 'probe' },
    h('button', { id: 'resume', onClick: () => modes.onGoalAction({ kind: 'resume' }) }, 'resume'),
    h('button', { id: 'pause', onClick: () => modes.onGoalAction({ kind: 'pause' }) }, 'pause'),
    modes.goalOpen && modes.goalRecord
      ? h(GoalBanner, {
          record: modes.goalRecord,
          running: false,
          continuation: modes.goalContinuation,
          evaluating: modes.goalEvaluating,
          pending: modes.pending,
          onAction: modes.onGoalAction,
          onOpenDetails: () => {},
        })
      : null,
  );
}

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) target[key] = (win as unknown as Record<string, unknown>)[key];
  target.fetch = async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes(`/${WITH_GOAL}/modes`) || url.includes(`/${LIVE_GOAL}/modes`)) {
      const live = url.includes(`/${LIVE_GOAL}/modes`);
      return new Response(
        JSON.stringify({
          sessionId: live ? LIVE_GOAL : WITH_GOAL,
          modes: {
            plan: false,
            goal: true,
            goalRecord: {
              id: 'g1',
              objective: 'Ship the importer',
              status: 'active',
              tokensUsed: 10,
              timeUsedSeconds: 5,
              createdAt: 0,
              updatedAt: 0,
            },
            // The loop's verdict rides the mode record, which is what lets a
            // reload show "stopped at 5 turns" instead of an active-looking goal.
            ...(live ? {} : { goalContinuation: { turn: 5, maxTurns: 5, stopped: 'max-turns' } }),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // What the route answers for a session with no file.
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) delete target[key];
  delete target.fetch;
});

afterEach(() => {
  if (container) render(null, container);
  container = undefined;
});

/** Mounts `sessionId`, then drains the hydrate promise and its re-render. */
async function mount(sessionId: string) {
  container ??= document.body.appendChild(document.createElement('div'));
  await act(async () => {
    render(h(Probe, { sessionId }), container as HTMLElement);
  });
  for (let i = 0; i < 10; i += 1) await act(async () => {});
  return container;
}

describe('useChatTimelineModes hydration', () => {
  test('a session with a live goal renders the strip', async () => {
    const el = await mount(WITH_GOAL);
    expect(el.querySelector('[data-goal-banner]')).not.toBeNull();
    expect(el.textContent).toContain('Ship the importer');
  });

  test('a session whose record cannot be read does not inherit the previous one', async () => {
    await mount(WITH_GOAL);
    const el = await mount(WITHOUT_FILE);
    expect(el.querySelector('[data-goal-banner]')).toBeNull();
    expect(el.textContent).not.toContain('Ship the importer');
  });

  test('an accepted Resume drops the last "stopped" verdict', async () => {
    const el = await mount(WITH_GOAL);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('omp:chamber-mode', {
          detail: {
            sessionId: WITH_GOAL,
            marker: {
              marker: 'CHAMBER_GOAL_CONTINUATION:',
              payload: { turn: 25, maxTurns: 25, stopped: 'max-turns' },
            },
          },
        }),
      );
    });
    expect(el.textContent).toContain('stopped at 25 turns');

    // omp's own resume opens no turn, so no frame would correct a stale verdict
    // — the loop's count starts over in the child and only its NEXT turn reports
    // a number. Leaving the row saying "stopped" would describe a state the
    // operator just left.
    await act(async () => {
      (el.querySelector('#resume') as HTMLButtonElement).click();
    });
    for (let i = 0; i < 10; i += 1) await act(async () => {});
    expect(el.textContent).not.toContain('stopped at');
  });

  test('an accepted Pause shows the paused row without waiting for a marker', async () => {
    const el = await mount(WITH_GOAL);
    await act(async () => {
      (el.querySelector('#pause') as HTMLButtonElement).click();
    });
    for (let i = 0; i < 10; i += 1) await act(async () => {});
    // No marker is dispatched in this test: the strip must not depend on the
    // event stream to reflect the press it just made.
    expect(el.querySelector('[data-goal-banner]')?.getAttribute('data-goal-banner')).toBe('paused');
    expect(el.textContent).toContain('Resume');
  });

  test('the loop deciding is visible: the evaluating frame spins the row', async () => {
    const el = await mount(LIVE_GOAL);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('omp:chamber-mode', {
          detail: { sessionId: LIVE_GOAL, marker: { marker: 'CHAMBER_GOAL_EVALUATING:', payload: { evaluating: true } } },
        }),
      );
    });
    expect(el.textContent).toContain('evaluating');
    expect(el.querySelector('.animate-spin')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('omp:chamber-mode', {
          detail: { sessionId: LIVE_GOAL, marker: { marker: 'CHAMBER_GOAL_EVALUATING:', payload: { evaluating: false } } },
        }),
      );
    });
    expect(el.textContent).not.toContain('evaluating');
  });

  test('a verdict the child persisted survives the reload that hydrates it', async () => {
    const el = await mount(WITH_GOAL);
    expect(el.textContent).toContain('stopped at 5 turns');
    expect(el.querySelector('[aria-label="Resume the goal"]')).not.toBeNull();
  });
});
