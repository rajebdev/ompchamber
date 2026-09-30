/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plan- and Goal-mode actuation for the chamber, running INSIDE the omp child.
 *
 * Why an extension: omp exposes neither mode over RPC. `RpcCommand` has no
 * plan/goal verb, `/plan` and `/goal` are `handleTui`-only (a prompt carrying
 * one reaches the model as literal text — measured), `mode_change` entries are
 * not restored under `--mode rpc-ui`, and `plan.defaultOnStartup` is read by
 * `interactive-mode.ts` alone. The extension API is the one surface that
 * reaches the live `AgentSession`, so the chamber ships this file and the spawn
 * path passes it with `-e <abs path>`.
 *
 * Why `-e` and not `~/.omp/agent/extensions/`: the chamber owns this file. An
 * install there would mutate the user's config, could be disabled from the
 * Settings → Extensions list, and would leave a stale copy behind on upgrade.
 * An explicit `-e` is also still honoured under `--no-extensions`.
 *
 * Control surface: one command, `/chamber-mode <scope> <action> [json]`,
 * dispatched by the chamber as an ordinary prompt. Measured: the command runs
 * locally, answers `agentInvoked: false`, and writes NO user message to the
 * transcript — so the mode controls never appear as conversation.
 *
 * Every outcome is reported through a notice MARKER (`CHAMBER_*_MARKER`), which
 * is how the chamber learns the new state without polling: the frames reach it
 * over the same event stream the transcript uses.
 */

import {
  activeSession,
  bindApi,
  ensureGoalTool,
  enterPlanMode,
  modeCapabilities,
  type ExtensionCtx,
  type ModeApi,
} from './session';
import { dispatchGoal, dispatchPlan, emit } from './commands';
import {
  CHAMBER_GOAL_STATE_ENTRY,
  CHAMBER_GOAL_STATE_MARKER,
  CHAMBER_MODE_COMMAND,
  CHAMBER_MODE_ERROR_MARKER,
  CHAMBER_PLAN_STATE_MARKER,
  CHAMBER_MODES_ENV,
  type GoalRecord,
} from './protocol';
import { goalStateRecord } from './goal';
import { installPlanProposal } from './plan';


function parseModesEnv(): { plan: boolean; goal: boolean } {
  const raw = process.env?.[CHAMBER_MODES_ENV] ?? '';
  return { plan: raw.includes('plan'), goal: raw.includes('goal') };
}

/**
 * Re-apply the chamber's persisted mode selection to a freshly spawned child.
 *
 * `--mode rpc-ui` never restores `mode_change`, so a session reopened from the
 * sidebar would otherwise come back with both modes off and the composer's
 * toggles lying. The flags ride in the spawn environment, which is the only
 * channel available before the child's first command.
 */
async function restoreModes(api: ModeApi, ctx: ExtensionCtx): Promise<void> {
  const wanted = parseModesEnv();
  if (!wanted.plan && !wanted.goal) return;
  const session = activeSession(api);
  if (!session) return;
  const caps = modeCapabilities(session);

  if (wanted.plan) {
    if (!caps.plan) emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'plan-mode API missing in this omp build' });
    else {
      const planFilePath = session.getPlanReferencePath?.() || 'local://PLAN.md';
      await enterPlanMode(session, planFilePath);
      installPlanProposal(session, ctx);
      emit(ctx, CHAMBER_PLAN_STATE_MARKER, { enabled: true, planFilePath });
    }
  }
  if (wanted.goal) {
    if (!caps.goal) emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'goal-mode API missing in this omp build' });
    else {
      // The tool is enabled so the toggle can act immediately, but a restored
      // goal is deliberately NOT resumed: omp pauses an active goal on a cold
      // start precisely so it cannot resume unattended, and overriding that
      // would start spending tokens the moment someone opened the tab. The
      // state is reported as paused, and the composer's Resume is what restarts
      // it — the same decision omp made, surfaced instead of undone.
      await ensureGoalTool(api, session);
      emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
    }
  }
}

/** The extension entry: registers `/chamber-mode`, omp's own command aliases,
 *  and the session/goal event handlers. */
export default function chamberModes(api: ModeApi): void {
  bindApi(api);

  api.registerCommand?.(CHAMBER_MODE_COMMAND, {
    description: 'Chamber plan/goal mode control (driven by the web console, not typed by hand)',
    handler: async (args: string, ctx: ExtensionCtx) => {
      const trimmed = args.trim();
      const [scopeToken = '', actionToken = '', ...tail] = trimmed.split(/\s+/);
      const scope = scopeToken.toLowerCase();
      const action = actionToken.toLowerCase();
      const rest = tail.join(' ');

      const session = activeSession(api);
      if (!session) {
        emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'no live session found for this process' });
        return;
      }
      if (scope === 'plan') await dispatchPlan(api, session, ctx, action, rest);
      else if (scope === 'goal') await dispatchGoal(api, session, ctx, action, rest);
      else emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: `unknown scope: ${scope || '(empty)'}` });
    },
  });

  // The DOCS' own syntax, answered by the same code path.
  //
  // omp implements `/plan` and `/goal` with `handleTui` only, so a typed one
  // would otherwise reach the model as literal text. Now that the chamber owns
  // these modes, a typed command is a real command: `/plan` toggles, `/goal`
  // opens the objective editor, and the subcommands the docs list are accepted.
  api.registerCommand?.('plan', {
    description: 'Toggle plan mode (agent plans before executing)',
    handler: async (args: string, ctx: ExtensionCtx) => {
      const session = activeSession(api);
      if (!session) {
        emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'no live session found for this process' });
        return;
      }
      const objective = args.trim();
      if (session.getPlanModeState?.()?.enabled && !objective) {
        await dispatchPlan(api, session, ctx, 'off', '');
        return;
      }
      await dispatchPlan(api, session, ctx, 'on', '');
      // A prompt alongside `/plan` is the FIRST plan-mode turn, which is what
      // the docs describe; send it as an ordinary prompt now that the mode is on.
      if (objective) await session.prompt?.(objective);
    },
  });

  api.registerCommand?.('goal', {
    description: 'Toggle goal mode (persistent autonomous objective for this session)',
    handler: async (args: string, ctx: ExtensionCtx) => {
      const session = activeSession(api);
      if (!session) {
        emit(ctx, CHAMBER_MODE_ERROR_MARKER, { reason: 'no live session found for this process' });
        return;
      }
      const trimmed = args.trim();
      const [sub = '', ...tail] = trimmed.split(/\s+/);
      const rest = tail.join(' ');
      switch (sub.toLowerCase()) {
        case '':
          // No argument: report the state so the operator sees where they are
          // instead of silently toggling a mode that needs an objective.
          emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
          return;
        case 'show':
        case 'state':
          emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
          return;
        case 'pause':
          await dispatchGoal(api, session, ctx, 'pause', '');
          return;
        case 'resume':
          await dispatchGoal(api, session, ctx, 'resume', '');
          return;
        case 'drop':
          await dispatchGoal(api, session, ctx, 'drop', '');
          return;
        case 'budget':
          await dispatchGoal(api, session, ctx, 'budget', rest);
          return;
        case 'set':
        default:
          // `/goal <objective>` and `/goal set <objective>` are the same thing;
          // a bare `/goal set` with no text reports the state rather than
          // creating a goal with an empty objective.
          if (!rest.trim()) {
            emit(ctx, CHAMBER_GOAL_STATE_MARKER, goalStateRecord(session));
            return;
          }
          await dispatchGoal(api, session, ctx, 'create', JSON.stringify({ objective: rest.trim() }));
      }
    },
  });

  api.on?.('session_start', async (_event: unknown, ctx: ExtensionCtx) => {
    await restoreModes(api, ctx);
  });

  // omp's own goal transitions are authoritative: the chamber mirrors them and
  // persists the record so a reload can recover the goal without re-reading
  // `mode_change` (which rpc-ui never restores).
  api.on?.('goal_updated', (event: unknown, ctx: ExtensionCtx) => {
    const payload = event as { goal?: GoalRecord | null; state?: { enabled?: boolean } | null };
    const record = { goal: payload.goal ?? null, enabled: payload.state?.enabled === true };
    // One record per transition, so the chamber's goal driver reads the state
    // it audits (and a reload recovers it) no matter who moved the goal: the
    // composer, the MODEL calling `goal({op:"create"})` after a guided
    // interview, or omp's own `/goal` typed in a TUI on the same session.
    api.appendEntry?.(CHAMBER_GOAL_STATE_ENTRY, record);
    emit(ctx, CHAMBER_GOAL_STATE_MARKER, record);
  });
}
