/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The `/chamber-mode` command surface: which action each scope accepts, and
 * what it answers.
 *
 * Split out of `index.ts` for the file ceiling, and it is also the natural
 * seam — `index.ts` owns the extension's lifecycle (binding the API, the
 * command registration, the event handlers), while everything here is a pure
 * dispatch over a session the caller already resolved.
 */

import {
  ensureGoalTool,
  enterPlanMode,
  exitPlanMode,
  modeCapabilities,
  recordPlanState,
  type ExtensionCtx,
  type ModeApi,
  type ModeSession,
} from './session';
import {
  CHAMBER_GOAL_STATE_MARKER,
  CHAMBER_MODE_ERROR_MARKER,
  CHAMBER_MODE_STATE_MARKER,
  CHAMBER_PLAN_STATE_MARKER,
  type GoalContinuationStop,
} from './protocol';
import {
  continueGoalTurn,
  createGoalFromSelection,
  finishGoalTurn,
  goalStateRecord,
  parseGoalArgs,
  persistContinuation,
  resetGoalContinuationTurns,
  startGoalTurn,
  startGuidedGoal,
} from './goal';
import { decidePlan, installPlanProposal } from './plan';

/** Report an outcome through the notice channel, which is how the chamber
 *  learns the new state without polling (the frame reaches it over the same
 *  event stream the transcript uses). */
export function emit(ctx: ExtensionCtx, marker: string, payload: unknown): void {
  ctx.ui?.notify?.(`${marker}${JSON.stringify(payload)}`, 'info');
}

/** Parse a command's trailing JSON payload; a bare string is the objective. */
export function parsePayload(rest: string): Record<string, unknown> {
  const trimmed = rest.trim();
  if (!trimmed) return {};
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { objective: trimmed };
  }
}

export async function dispatchPlan(
  api: ModeApi,
  session: ModeSession,
  ctx: ExtensionCtx,
  action: string,
  rest: string,
): Promise<void> {
  if (!modeCapabilities(session).plan) {
    emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'plan-mode API missing in this omp build' });
    return;
  }
  if (action === 'on') {
    const planFilePath = session.getPlanReferencePath?.() || 'local://PLAN.md';
    await enterPlanMode(session, planFilePath);
    installPlanProposal(session, ctx);
    recordPlanState(api, true);
    emit(ctx, CHAMBER_PLAN_STATE_MARKER, { enabled: true, planFilePath });
    return;
  }
  if (action === 'off') {
    installPlanProposal(session, ctx, { clear: true });
    exitPlanMode(session);
    recordPlanState(api, false);
    emit(ctx, CHAMBER_PLAN_STATE_MARKER, { enabled: false, planFilePath: '' });
    return;
  }
  if (action === 'decide') {
    const payload = parsePayload(rest);
    const choice = typeof payload.choice === 'string' ? payload.choice : '';
    const feedback = typeof payload.feedback === 'string' ? payload.feedback : '';
    const handled = await decidePlan(api, session, ctx, choice, feedback);
    if (!handled) emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'no plan is awaiting review' });
    return;
  }
  if (action === 'state') {
    emit(ctx, CHAMBER_MODE_STATE_MARKER, { plan: session.getPlanModeState?.() ?? null, goal: goalStateRecord(session) });
    return;
  }
  emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: `unknown plan action: ${action}` });
}

export async function dispatchGoal(
  api: ModeApi,
  session: ModeSession,
  ctx: ExtensionCtx,
  action: string,
  rest: string,
): Promise<void> {
  if (!modeCapabilities(session).goal) {
    emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'goal-mode API missing in this omp build' });
    return;
  }
  if (!(await ensureGoalTool(api, session))) {
    emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'could not enable the goal tool for this session' });
    return;
  }
  const runtime = session.goalRuntime;

  switch (action) {
    case 'create': {
      const { objective, tokenBudget, maxTurns } = parseGoalArgs(rest);
      if (!objective) {
        emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'an objective is required' });
        return;
      }
      await createGoalFromSelection(session, { objective, tokenBudget, maxTurns });
      // Both halves of what omp's own `/goal <objective>` does: the record AND
      // the opening turn. `createGoal` opens no turn by itself, so without the
      // second call the goal went live with an idle child — measured on a real
      // session, where the toggle read `goalLive` and nothing ever ran. From
      // there the CHAMBER drives: it audits this turn and calls `continue`.
      startGoalTurn(api, objective);
      emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
      return;
    }
    // The chamber's goal driver asks for one more automatic turn after its
    // auditor said "keep going". The hidden message can only be sent from in
    // here, and so are the two hard stops that back the auditor up.
    case 'continue':
      continueGoalTurn({ api, session, emit, ctx, maxTurns: parseGoalArgs(rest).maxTurns });
      return;
    // The auditor's terminal verdict (`complete`, `blocked`, or an audit that
    // could not be taken): record why the loop stopped driving.
    case 'done': {
      const { stopped } = parseGoalArgs(rest);
      finishGoalTurn({ api, session, emit, ctx }, (stopped ?? 'complete') as GoalContinuationStop);
      return;
    }
    case 'guided': {
      // The interview ends with the MODEL calling `goal({op:"create"})`, which
      // is why the tool had to be enabled above — the `goal_updated` it emits
      // is what turns the toggle on.
      startGuidedGoal(api, rest.trim());
      return;
    }
    case 'pause':
      await runtime?.pauseGoal();
      // The verdict describes a loop that was running; while the goal is paused
      // it is stale, and Resume clears it outright — so neither state should be
      // recoverable as "stopped at N turns" after a reload.
      persistContinuation(api, session, null);
      emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
      return;
    case 'resume':
      await runtime?.resumeGoal();
      // A resumed goal must loop too, and the operator just asked for it. The
      // turn counter restarts with it: a goal that stopped at `max-turns` would
      // otherwise stand down again on the very next decision, making Resume a
      // button that does nothing until the child is restarted. The chamber
      // nudges the loop right after this answers, so an idle session starts
      // working without waiting for a user message.
      resetGoalContinuationTurns();
      persistContinuation(api, session, null);
      emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
      return;
    case 'drop':
      await runtime?.dropGoal();
      emit(ctx, CHAMBER_GOAL_STATE_MARKER, { goal: null, enabled: false });
      return;
    case 'budget': {
      const value = rest.trim();
      const budget = value === 'off' || value === '' ? undefined : Number.parseInt(value, 10);
      if (budget !== undefined && (!Number.isInteger(budget) || budget <= 0)) {
        emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'budget must be a positive integer, or `off`' });
        return;
      }
      await runtime?.onBudgetMutated(budget);
      emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
      return;
    }
    case 'state':
      emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
      return;
    default:
      emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: `unknown goal action: ${action}` });
  }
}
