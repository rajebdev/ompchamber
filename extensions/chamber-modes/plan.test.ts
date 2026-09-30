/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The plan-review decision, end to end inside the extension.
 *
 * Every exit path must report itself. The panel closes on the child's
 * `CHAMBER_PLAN_DECISION` marker and NOT on the HTTP request returning — it
 * stays up while the decision is in flight, deliberately, so a decision that
 * silently failed cannot leave the operator looking at a plan nobody is waiting
 * on.
 *
 * That contract was broken for `Refine plan`: the branch resolved the parked
 * promise (so the agent started planning again) but returned without a marker,
 * and the panel sat on screen over a live agent. It was found in the browser,
 * not by a unit test — hence this file.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { awaitParkedProposal, decidePlan, installPlanProposal } from './plan';
import {
  CHAMBER_PLAN_DECISION_MARKER,
  CHAMBER_PLAN_PROPOSAL_MARKER,
  CHAMBER_PLAN_STATE_MARKER,
} from './protocol';
import type { ExtensionCtx, ModeApi, ModeSession } from './session';

/** The handler the extension installs, exposed so a test can drive it. */
interface HandlerHost {
  handler?: (title: string) => Promise<unknown>;
}

interface Harness {
  api: ModeApi;
  session: ModeSession;
  ctx: ExtensionCtx;
  notices: string[];
  appended: Array<{ customType: string; data: unknown }>;
  sent: Array<{ customType: string; content: string }>;
  planEnabled: () => boolean;
}

function harness(): Harness {
  const notices: string[] = [];
  const appended: Harness['appended'] = [];
  const sent: Harness['sent'] = [];
  let planState: { enabled: boolean; planFilePath: string } | undefined = {
    enabled: true,
    planFilePath: 'local://PLAN.md',
  };

  const host: HandlerHost = {};
  const session: ModeSession = {
    getPlanModeState: () => planState,
    setPlanModeState: (state) => {
      planState = state;
    },
    setPlanProposalHandler: (handler) => {
      host.handler = handler ?? undefined;
    },
    preparePlanForReview: async (title: string) => ({
      details: { planFilePath: `local://${title}-plan.md`, title, planExists: true },
    }),
    setPlanReferencePath: () => {},
    sessionManager: { appendModeChange: () => 'id', getSessionId: () => 's1' },
  };

  const api: ModeApi = {
    appendEntry: (customType, data) => appended.push({ customType, data }),
    sendMessage: (message) => sent.push({ customType: message.customType, content: message.content }),
  };

  const ctx: ExtensionCtx = {
    cwd: '/tmp/plan-review-test',
    ui: { notify: (message) => notices.push(message) },
    clearTimer: () => {},
    setTimeout: () => 1,
  };

  // Expose the installed handler through the session object the harness owns, so
  // the test never re-derives it from a cast at the call site.
  (session as unknown as HandlerHost).handler = undefined;
  const exposed: Harness & HandlerHost = {
    api,
    session,
    ctx,
    notices,
    appended,
    sent,
    planEnabled: () => planState?.enabled === true,
  };
  Object.defineProperty(exposed, 'handler', {
    get: () => host.handler,
  });
  return exposed;
}

/** Install the handler and park a proposal through it.
 *
 *  Awaits the parked state rather than a duration: the handler reads the plan
 *  file first, so the return of `installPlanProposal` says nothing about when
 *  the slot is filled. */
async function propose(h: Harness): Promise<void> {
  installPlanProposal(h.session, h.ctx);
  const handler = (h as Harness & HandlerHost).handler;
  if (!handler) throw new Error('proposal handler was not installed');
  void handler('migrate-importer');
  await awaitParkedProposal();
}

/**
 * The parked proposal is module-level state (omp permits one `xd://propose` at
 * a time per session), so a test that proposes and does not decide would leave
 * its proposal parked for the next one. Cleared through the extension's own
 * public teardown — the same call `plan off` makes.
 */
beforeEach(() => {
  const h = harness();
  installPlanProposal(h.session, h.ctx, { clear: true });
});

function markers(h: Harness): string[] {
  return h.notices.filter((n) => n.startsWith('CHAMBER_'));
}

function decisionOf(h: Harness): Record<string, unknown> | undefined {
  const marker = markers(h).find((m) => m.startsWith(CHAMBER_PLAN_DECISION_MARKER));
  if (!marker) return undefined;
  const parsed: unknown = JSON.parse(marker.slice(CHAMBER_PLAN_DECISION_MARKER.length));
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
}

describe('decidePlan', () => {
  test('a proposal is announced to the console', async () => {
    const h = harness();
    await propose(h);
    const proposal = markers(h).find((m) => m.startsWith(CHAMBER_PLAN_PROPOSAL_MARKER));
    expect(proposal).toBeDefined();
    const payload = JSON.parse((proposal as string).slice(CHAMBER_PLAN_PROPOSAL_MARKER.length)) as { title?: string };
    expect(payload.title).toBe('migrate-importer');
  });

  test('Refine reports the decision and keeps plan mode on', async () => {
    const h = harness();
    await propose(h);
    expect(await decidePlan(h.api, h.session, h.ctx, 'Refine plan', 'shorter')).toBe(true);
    // The marker is what closes the panel; without it the review surface stayed
    // up over an agent that was already planning again.
    expect(decisionOf(h)?.choice).toBe('Refine plan');
    // Refine keeps plan mode ON: the model is expected to revise and re-propose.
    expect(h.planEnabled()).toBe(true);
  });

  test('each approve variant reports the decision and leaves plan mode', async () => {
    for (const choice of ['Approve and execute', 'Approve and keep context']) {
      const h = harness();
      await propose(h);
      expect(await decidePlan(h.api, h.session, h.ctx, choice, '')).toBe(true);
      expect(decisionOf(h)?.choice).toBe(choice);
      expect(h.planEnabled()).toBe(false);
      // The execution turn rides a hidden message, so the transcript carries the
      // plan without a visible "Plan approved." bubble.
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]?.content).toContain('Plan approved');
    }
  });

  test('leaving plan mode is both PERSISTED and broadcast', async () => {
    const h = harness();
    await propose(h);
    await decidePlan(h.api, h.session, h.ctx, 'Approve and keep context', '');
    // The entry is what a reload reads back, and the marker is what moves the
    // composer's toggle right now. Writing only the entry left the Plan button
    // showing as pressed over a session that was already executing — found in
    // the browser, which is why both halves are asserted here.
    const planEntries = h.appended.filter((e) => e.customType === 'chamber-plan-state');
    expect(planEntries.at(-1)?.data).toEqual({ enabled: false });
    const planState = markers(h).filter((m) => m.startsWith(CHAMBER_PLAN_STATE_MARKER));
    const last = JSON.parse((planState.at(-1) as string).slice(CHAMBER_PLAN_STATE_MARKER.length)) as { enabled?: boolean };
    expect(last.enabled).toBe(false);
  });

  test('a decision with nothing parked is refused, not silently dropped', async () => {
    const h = harness();
    expect(await decidePlan(h.api, h.session, h.ctx, 'Approve and keep context', '')).toBe(false);
  });
});
