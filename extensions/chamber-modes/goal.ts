/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Goal-mode actuation and the auto-continuation loop, inside the omp child.
 *
 * ## Why the loop lives here and not in the chamber server
 *
 * The TUI's `#scheduleGoalContinuation` (`interactive-mode.ts`) is
 * interactive-only, so `--mode rpc-ui` never re-opens a goal turn on its own —
 * without this, Goal mode runs exactly one turn and stops, which is not the
 * "keeps working across turns" the feature is for.
 *
 * The obvious server-side implementation does not work: the RPC command union
 * has `prompt`/`steer`/`follow_up` and nothing else, so a chamber-sent
 * continuation arrives as a VISIBLE USER MESSAGE and every automatic turn would
 * leave a "Continue active goal." bubble in the transcript. The extension can
 * send a hidden custom message (`display: false`), which is exactly what the
 * TUI does — and it also sees `agent_end.willContinue`, the one signal that
 * says omp has already scheduled its own continuation.
 *
 * The chamber still owns the on/off decision (the composer toggle) and Pause:
 * the loop only fires while `status === 'active'`, and Pause flips that.
 */

import { GOAL_CONTINUATION_PROMPT, GUIDED_GOAL_INTERVIEW_PROMPT, renderPrompt } from './prompts';
import type { ExtensionCtx, ModeApi, ModeSession } from './session';
import type { GoalRecord } from './protocol';

/** Opt-in flag the spawn path sets when goal mode is part of the selection.
 *  Absent means "no automatic continuation", so a plain chat can never start
 *  looping just because a goal record exists in the file. */
const AUTO_CONTINUE_ENV = 'CHAMBER_GOAL_AUTO_CONTINUE';

/** Hard ceiling on automatic turns for one goal. The token budget is the
 *  primary guard, but a goal with `budget off` has none — and an agent that
 *  keeps finding work would otherwise run until the process is killed. */
const MAX_TURNS_ENV = 'CHAMBER_GOAL_MAX_TURNS';
const DEFAULT_MAX_TURNS = 25;

/** Custom-message types, matching the TUI's own naming so a transcript written
 *  by either surface reads the same. */
const GOAL_CONTINUATION_TYPE = 'goal-continuation';
const GUIDED_GOAL_TYPE = 'guided-goal-interview';

interface GoalArgs {
  objective?: string;
  tokenBudget?: number;
  guided?: string;
}

/** Parse the JSON payload a chamber command carries.
 *
 *  The payload is JSON rather than `key=value` pairs because an objective is
 *  free-form text: it holds spaces, punctuation and newlines, and JSON encodes
 *  every one of them onto a single line — which matters because the whole
 *  command travels as one prompt line. */
export function parseGoalArgs(rest: string): GoalArgs {
  const trimmed = rest.trim();
  if (!trimmed) return {};
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    payload =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Not JSON: treat the raw text as the objective, so a hand-typed
    // `/chamber-mode goal create fix the build` still does something sane.
    payload = { objective: trimmed };
  }
  const objective = typeof payload.objective === 'string' ? payload.objective.trim() : undefined;
  const guided = typeof payload.guided === 'string' ? payload.guided : undefined;
  const rawBudget = payload.tokenBudget;
  const tokenBudget =
    typeof rawBudget === 'number' && Number.isInteger(rawBudget) && rawBudget > 0 ? rawBudget : undefined;
  return { objective, tokenBudget, guided };
}

/** The record the chamber mirrors. `enabled` is what decides whether the
 *  composer's toggle reads as on; a paused goal keeps its record. */
export function goalStateRecord(session: ModeSession): { goal: GoalRecord | null; enabled: boolean } {
  const state = session.getGoalModeState?.();
  if (!state?.goal) return { goal: null, enabled: false };
  return { goal: state.goal as GoalRecord, enabled: state.enabled };
}

/**
 * Create a goal, or resume the paused one.
 *
 * `createGoal` refuses a session that already carries a goal — omp throws
 * "cannot create a new goal because this session already has a goal" for any
 * status but `dropped`/`complete`. The composer's Goal toggle is a single
 * button, so pressing it on a paused session must resume rather than fail.
 */
export async function createGoalFromSelection(
  session: ModeSession,
  input: { objective: string; tokenBudget?: number },
): Promise<void> {
  const runtime = session.goalRuntime;
  if (!runtime) throw new Error('goal runtime unavailable');
  const existing = session.getGoalModeState?.();
  if (existing?.goal && existing.goal.status === 'paused') {
    await runtime.resumeGoal();
    return;
  }
  await runtime.createGoal({ objective: input.objective, tokenBudget: input.tokenBudget });
}

/**
 * Start the guided-goal interview.
 *
 * A normal conversation with a hidden kickoff: the agent asks its questions as
 * ordinary assistant turns, the operator answers in the composer, and the model
 * closes by calling `goal({op:"create"})` itself — which flips goal mode on
 * through `goal_updated`. The `goal` tool must already be active, which is what
 * the caller's `ensureGoalTool` provides.
 */
export function startGuidedGoal(api: ModeApi, rough: string): void {
  const content = renderPrompt(GUIDED_GOAL_INTERVIEW_PROMPT, { initial: rough || undefined });
  api.sendMessage?.({ customType: GUIDED_GOAL_TYPE, content, display: false }, { triggerTurn: true });
}

/**
 * Install the auto-continuation loop.
 *
 * `getSession` is a closure rather than a value: the registry entry is created
 * during session start, so a captured session would be the one from load time.
 */
export function installGoalContinuation(
  api: ModeApi,
  getSession: (api: ModeApi) => ModeSession | undefined,
  emit: (ctx: ExtensionCtx, marker: string, payload: unknown) => void,
): void {
  let turns = 0;
  let countedGoalId: string | undefined;

  api.on?.('agent_end', (event: unknown, ctx: ExtensionCtx) => {
    if (process.env?.[AUTO_CONTINUE_ENV] !== '1') return;
    const payload = event as { willContinue?: boolean } | undefined;
    // omp already scheduled its own continuation (auto-retry, an unexpected-stop
    // retry, a background job). Firing here too would open a second turn.
    if (payload?.willContinue === true) return;

    const session = getSession(api);
    const state = session?.getGoalModeState?.();
    if (!session || !state?.enabled || state.goal.status !== 'active') {
      turns = 0;
      countedGoalId = undefined;
      return;
    }

    // A new goal starts its own count; the ceiling is per goal, not per process.
    if (countedGoalId !== state.goal.id) {
      countedGoalId = state.goal.id;
      turns = 0;
    }
    const configured = Number.parseInt(process.env?.[MAX_TURNS_ENV] ?? '', 10);
    const ceiling = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_TURNS;
    const goal = state.goal as GoalRecord;
    const budget = goal.tokenBudget;
    // Same guard chain the chamber uses (`session/goal-continuation.ts`): Stop,
    // the mode flags, then the budget, then the turn ceiling. Applied here too
    // because THIS process is the one that has to stop, and it cannot wait for
    // a chamber that may be gone.
    if (budget !== undefined && goal.tokensUsed >= budget) return;
    if (turns >= ceiling) {
      emit(ctx, 'CHAMBER_GOAL_CONTINUATION:', { turn: turns, maxTurns: ceiling, stopped: 'max-turns' });
      return;
    }

    turns += 1;
    emit(ctx, 'CHAMBER_GOAL_CONTINUATION:', { turn: turns, maxTurns: ceiling });
    const content = renderPrompt(GOAL_CONTINUATION_PROMPT, {
      objective: goal.objective,
      tokensUsed: goal.tokensUsed,
      tokenBudget: budget === undefined ? 'none' : budget,
      remainingTokens: budget === undefined ? 'unbounded' : Math.max(0, budget - goal.tokensUsed),
      timeUsedSeconds: goal.timeUsedSeconds,
    });
    api.sendMessage?.({ customType: GOAL_CONTINUATION_TYPE, content, display: false }, { triggerTurn: true });
  });
}
