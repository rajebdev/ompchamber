/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The goal loop's two arming rules.
 *
 * Both were wrong in a way a unit test of the guards would not have caught,
 * and both were found by watching a real child: the composer's Goal toggle
 * created the record, the toggle went live, and NOTHING ever ran. The record
 * alone is not a goal in flight — `createGoal` opens no turn, and the loop
 * that would have opened the next one was gated on a spawn-time environment
 * variable that a session spawned BEFORE the goal existed can never carry.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  armGoalContinuation,
  disarmGoalContinuation,
  installGoalContinuation,
  startGoalTurn,
} from './goal';
import type { GoalRecord } from './protocol';
import type { ExtensionCtx, ModeApi, ModeSession } from './session';

const AUTO_CONTINUE_ENV = 'CHAMBER_GOAL_AUTO_CONTINUE';

interface Harness {
  api: ModeApi;
  ctx: ExtensionCtx;
  sent: Array<{ customType: string; content: string; display?: boolean }>;
  /** Fire the extension's own `agent_end` handler. */
  endTurn: (willContinue?: boolean) => void;
  setGoal: (status: GoalRecord['status'], enabled?: boolean) => void;
  /** The session slice the loop reads its state from. */
  session: ModeSession;
}

function harness(): Harness {
  const sent: Harness['sent'] = [];
  let goal: GoalRecord = {
    id: 'g1',
    objective: 'ship it',
    status: 'active',
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  let enabled = true;
  let handler: ((event: unknown, ctx: ExtensionCtx) => unknown) | undefined;

  const session: ModeSession = {
    getGoalModeState: () => ({ goal, enabled }),
    goalRuntime: {
      createGoal: async () => goal,
      resumeGoal: async () => goal,
      pauseGoal: async () => {},
      dropGoal: async () => {},
      onBudgetMutated: async () => {},
    },
  };

  const api: ModeApi = {
    sendMessage: (message, options) => {
      sent.push({ customType: message.customType, content: message.content, display: message.display });
      void options;
    },
    on: (event, fn) => {
      if (event === 'agent_end') handler = fn as typeof handler;
    },
  };

  const ctx: ExtensionCtx = { cwd: '/tmp/goal-test', ui: { notify: () => {} } };

  return {
    api,
    ctx,
    sent,
    session,
    endTurn: (willContinue = false) => { handler?.({ willContinue }, ctx); },
    setGoal: (status, nextEnabled = true) => {
      goal = { ...goal, status };
      enabled = nextEnabled;
    },
  };
}

beforeEach(() => {
  // Module state, like `parked` in `plan.test.ts`: a goal armed by one test
  // would otherwise still be armed for the next one.
  delete process.env[AUTO_CONTINUE_ENV];
  disarmGoalContinuation();
});

describe('goal continuation arming', () => {
  test('a goal started in this process loops, even though the spawn env says nothing', () => {
    const h = harness();
    installGoalContinuation(h.api, () => h.session, () => {});
    // The spawn env is what the OLD gate read, and it is empty for the common
    // case: the session was spawned first, the goal was set afterwards.
    expect(process.env[AUTO_CONTINUE_ENV]).toBeUndefined();

    armGoalContinuation();
    h.endTurn();

    expect(h.sent.map((m) => m.customType)).toEqual(['goal-continuation']);
    expect(h.sent[0]?.display).toBe(false);
  });

  test('a goal that was never armed does not loop', () => {
    const h = harness();
    installGoalContinuation(h.api, () => h.session, () => {});
    // A session file that merely CARRIES a goal must not start spending tokens
    // because someone opened the tab — the check this arming flag sits beside.
    h.endTurn();
    expect(h.sent).toEqual([]);
  });

  test('a paused goal does not loop even when armed', () => {
    const h = harness();
    installGoalContinuation(h.api, () => h.session, () => {});
    armGoalContinuation();
    h.setGoal('paused');
    h.endTurn();
    expect(h.sent).toEqual([]);
  });

  test('omp having scheduled its own continuation suppresses ours', () => {
    const h = harness();
    installGoalContinuation(h.api, () => h.session, () => {});
    armGoalContinuation();
    // Firing here too would open a second turn over omp's own.
    h.endTurn(true);
    expect(h.sent).toEqual([]);
  });
});

describe('startGoalTurn', () => {
  test('the objective is sent as a hidden turn, not as a visible message', () => {
    const h = harness();
    startGoalTurn(h.api, 'ship it');
    // `createGoal` writes the record and opens nothing; this is the half that
    // makes the goal actually start, and `display: false` is what keeps the
    // objective out of the transcript as a second user bubble.
    expect(h.sent).toEqual([{ customType: 'goal-start', content: 'ship it', display: false }]);
  });
});
