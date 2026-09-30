/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plan review: the parked `xd://propose`, and the five ways out of it.
 *
 * ## The parking contract
 *
 * Plan mode's approval path is a `write` to `xd://propose`, which omp dispatches
 * to whatever `setPlanProposalHandler` installed. The TUI's handler opens the
 * full-screen review overlay and resolves when the operator picks; the model's
 * tool call stays open for the whole time. That is exactly what the chamber
 * needs — the operator reviews in the web console, and the decision travels
 * back — so this handler parks the promise the same way.
 *
 * Parking is safe: measured on omp 18.4.4 with a proposal held for 45 s, the RPC
 * loop stays responsive (`get_state` answers, a second command runs) because the
 * handler blocks only the tool call, not the reader. Two things keep a parked
 * proposal from becoming a hung run:
 *
 *  - a managed timeout (`PLAN_DECISION_TIMEOUT_MS`) resolves it as a refinement
 *    request, so an abandoned review degrades to "the model keeps planning";
 *  - `plan off` resolves it the same way before tearing plan mode down, so
 *    turning the toggle off mid-review cannot strand the turn.
 *
 * ## The five choices
 *
 * They are omp's own, verbatim, because the operator is choosing between omp
 * behaviours and not chamber behaviours. The plan body is read through
 * `resolveLocalRoot` — omp's own mapping for `local://` — so the chamber never
 * keeps a second copy of the resolution rules.
 */

import { PLAN_MODE_APPROVED_PROMPT, PLAN_MODE_COMPACT_INSTRUCTIONS_PROMPT, renderPrompt } from './prompts';
import { recordPlanState, type ExtensionCtx, type ModeApi, type ModeSession } from './session';
import {
  CHAMBER_PLAN_DECISION_MARKER,
  CHAMBER_PLAN_PROPOSAL_MARKER,
  CHAMBER_PLAN_SAVED_MARKER,
  CHAMBER_PLAN_STATE_MARKER,
  PLAN_REVIEW_CHOICES,
} from './protocol';

/** How long a parked proposal waits before it is released as a refinement.
 *  The model's tool call is open for the whole window. */
const PLAN_DECISION_TIMEOUT_MS = 30 * 60 * 1000;

/** Custom-message type the approved plan rides as, mirroring omp's own
 *  `plan-mode-reference` bookkeeping so a transcript reads the same either way. */
const PLAN_MODE_REFERENCE_TYPE = 'plan-mode-reference';

interface ParkedProposal {
  title: string;
  planFilePath: string;
  planContent: string;
  resolve: (result: unknown) => void;
  timer: unknown;
}

/** The single parked proposal for this process. omp permits one `xd://propose`
 *  at a time per session (the handler is replaced, never stacked), so a slot
 *  rather than a map is the honest shape. */
let parked: ParkedProposal | null = null;

/** Resolvers waiting for the next proposal to park. See `awaitParkedProposal`. */
let parkedWaiters: Array<() => void> = [];

/**
 * Resolve once a proposal is parked (immediately when one already is).
 *
 * A seam for the test suite, and honest about why it has to exist: parking
 * happens AFTER the plan file is read, so a caller cannot know from the return
 * of `installPlanProposal` whether the handler has reached its parked state —
 * and a test that guessed with a delay would be racing the read rather than
 * waiting for it.
 */
export function awaitParkedProposal(): Promise<void> {
  if (parked) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers<void>();
  parkedWaiters.push(resolve);
  return promise;
}

/**
 * omp's `local://` root resolver, loaded ON DEMAND.
 *
 * Dynamic on purpose: the module lives in the omp package, which is installed
 * in the machine's global prefix and is NOT a chamber dependency — a static
 * import would make this file unresolvable outside a child process (measured:
 * `bun test` on this very file failed with "Cannot find module
 * '@oh-my-pi/pi-coding-agent/internal-urls'"). Inside the child the specifier
 * resolves, and the load is cached after the first call.
 */
async function localRootResolver(): Promise<((options: unknown) => string) | null> {
  try {
    const mod: unknown = await import('@oh-my-pi/pi-coding-agent/internal-urls');
    if (mod && typeof mod === 'object' && 'resolveLocalRoot' in mod) {
      const resolver = mod.resolveLocalRoot;
      return typeof resolver === 'function' ? (resolver as (options: unknown) => string) : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read a `local://` artifact through omp's own root mapping. */
async function readPlanFile(ctx: ExtensionCtx, planFilePath: string): Promise<string> {
  try {
    const resolveLocalRoot = await localRootResolver();
    if (!resolveLocalRoot) return '';
    const root = resolveLocalRoot(ctx.localProtocolOptions);
    const relative = planFilePath.replace(/^local:\/+/i, '');
    const file = Bun.file(`${root}/${relative}`);
    if (!(await file.exists())) return '';
    return await file.text();
  } catch {
    // A plan that cannot be read is reported as an empty body; the approval
    // itself still works, because omp re-reads the file its own way.
    return '';
  }
}

/** Resolve a parked proposal with a refinement request, which keeps plan mode
 *  active and hands the model a reason instead of a decision. */
function releaseForRefinement(reason: string): void {
  const current = parked;
  if (!current) return;
  parked = null;
  current.resolve({
    content: [{ type: 'text', text: `${reason} Update the plan file, then write its title to xd://propose again.` }],
    details: { planFilePath: current.planFilePath, title: current.title, planExists: true },
  });
}

/** Release the parked proposal because plan mode is being torn down. */
function releaseParkedProposal(): void {
  releaseForRefinement('Plan review was dismissed.');
}

/**
 * Install (or clear) the proposal handler.
 *
 * `clear: true` uninstalls it AND releases anything parked, so `plan off`
 * during a review cannot leave the model blocked on a promise whose review
 * surface is gone.
 */
export function installPlanProposal(
  session: ModeSession,
  ctx: ExtensionCtx,
  options?: { clear?: boolean },
): void {
  if (options?.clear) {
    releaseParkedProposal();
    session.setPlanProposalHandler?.(null);
    return;
  }
  session.setPlanProposalHandler?.(async (title: string) => {
    // Validate through omp's own resolver. The model writes a title, and a
    // grammar-constrained model can emit something a filename cannot carry —
    // measured: `"write-blocked-file\nWrite /tmp/x.txt"`, which became a plan
    // path containing a newline. `preparePlanForReview` normalizes the title
    // (spaces → hyphens, invalid characters dropped) and resolves the plan
    // file through omp's own scan, so the chamber reviews what omp would have
    // approved.
    let resolvedTitle = title;
    let planFilePath = `local://${title.replace(/-plan$/i, '')}-plan.md`;
    let details: { planFilePath: string; title: string; planExists: boolean } | undefined;
    if (typeof session.preparePlanForReview === 'function') {
      try {
        const prepared = await session.preparePlanForReview(title);
        resolvedTitle = prepared.details.title;
        planFilePath = prepared.details.planFilePath;
        details = prepared.details;
      } catch {
        // Fall through to the constructed URL; the read below reports an empty
        // body, and the operator still gets a review surface with the raw title.
      }
    }
    const planContent = await readPlanFile(ctx, planFilePath);
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const timer = ctx.setTimeout?.(
      () => releaseForRefinement('The plan review timed out without a decision.'),
      PLAN_DECISION_TIMEOUT_MS,
    );
    parked = { title: resolvedTitle, planFilePath, planContent, resolve, timer };
    const waiters = parkedWaiters;
    parkedWaiters = [];
    for (const waiter of waiters) waiter();
    ctx.ui?.notify?.(
      `${CHAMBER_PLAN_PROPOSAL_MARKER}${JSON.stringify({ title: resolvedTitle, planFilePath, planContent, details })}`,
      'info',
    );
    return promise;
  });
}

/**
 * Resolve the parked proposal with the operator's choice.
 *
 * Returns false when nothing was parked, so the chamber can report a stale
 * decision instead of silently doing nothing.
 */
export async function decidePlan(
  api: ModeApi,
  session: ModeSession,
  ctx: ExtensionCtx,
  choice: string,
  feedback: string,
): Promise<boolean> {
  // Every path out of the review LEAVES plan mode, and both the persisted flag
  // and the LIVE console have to say so: the entry is what a reload reads back,
  // and the marker is what moves the composer's toggle now. Recording only the
  // entry left the button showing "Plan" as pressed over a session that was
  // executing (found in the browser).
  const leavePlanMode = () => {
    session.setPlanModeState?.(undefined);
    session.sessionManager?.appendModeChange?.('none');
    recordPlanState(api, false);
    ctx.ui?.notify?.(`${CHAMBER_PLAN_STATE_MARKER}${JSON.stringify({ enabled: false, planFilePath: '' })}`, 'info');
  };
  const current = parked;
  if (!current) return false;
  parked = null;
  if (current.timer) ctx.clearTimer?.(current.timer);

  if (choice === 'Refine plan') {
    const note = feedback.trim() || 'The operator asked for another pass.';
    current.resolve({
      content: [{ type: 'text', text: `${note}\n\nUpdate the plan file, then write its title to xd://propose again.` }],
      details: { planFilePath: current.planFilePath, title: current.title, planExists: true },
    });
    // The review surface closes on this marker, NOT on the request returning:
    // the panel stays up while `deciding` is set so a decision that silently
    // failed cannot leave the operator looking at a stale plan. Refine used to
    // return without one, so the panel stayed on screen over an agent that was
    // already planning again (found in the browser, not by the unit tests).
    emitDecision(ctx, { choice, title: current.title });
    return true;
  }

  if (choice === 'Save and quit') {
    // Nothing executes: the operator wanted the plan on disk for later. omp's
    // own autosave writes `<project>/.omp/plans/<TOPIC>_PLAN.md` when
    // `plan.autosave` is on; this path always writes, because the choice IS the
    // instruction to save.
    const stem = current.title.replace(/[^\w.-]+/g, '_').toUpperCase();
    const target = `${ctx.cwd ?? process.cwd()}/${stem.endsWith('_PLAN') ? stem : `${stem}_PLAN`}.md`;
    try {
      await Bun.write(target, current.planContent);
      current.resolve({
        content: [{ type: 'text', text: `Plan saved to ${target}. No implementation was started.` }],
        details: { planFilePath: current.planFilePath, title: current.title, planExists: true },
      });
      ctx.ui?.notify?.(`${CHAMBER_PLAN_SAVED_MARKER}${JSON.stringify({ path: target })}`, 'info');
    } catch (error) {
      current.resolve({
        content: [{ type: 'text', text: `Could not save the plan: ${String(error)}` }],
        details: { planFilePath: current.planFilePath, title: current.title, planExists: true },
      });
      // A failed save still ends the review — the model reports the failure in
      // the transcript — so the panel must close or it would sit over a plan
      // nobody is waiting on any more.
      emitDecision(ctx, { choice, title: current.title, failed: true });
    }
    session.setPlanProposalHandler?.(null);
    leavePlanMode();
    return true;
  }

  // The three approve variants differ in what happens to CONTEXT, not to the
  // plan: `execute` starts a fresh session, `compact context` distils the
  // current one, `keep context` carries the whole planning conversation.
  session.setPlanProposalHandler?.(null);
  session.setPlanReferencePath?.(current.planFilePath);
  leavePlanMode();

  if (choice === 'Approve and compact context') {
    try {
      await ctx.compact?.(renderPrompt(PLAN_MODE_COMPACT_INSTRUCTIONS_PROMPT, { planFilePath: current.planFilePath }));
    } catch {
      // A failed compaction is not a failed approval: the execution turn below
      // still carries the plan inline, which is what the model needs.
    }
  }

  if (choice === 'Approve and execute') {
    try {
      await ctx.newSession?.();
    } catch {
      // Falling back to the current session keeps the approval meaningful; the
      // plan is still handed over inline below.
    }
  }

  const prompt = renderPrompt(PLAN_MODE_APPROVED_PROMPT, {
    planFilePath: current.planFilePath,
    planContent: current.planContent,
    contextPreserved: choice !== 'Approve and execute',
  });
  api.sendMessage?.({ customType: PLAN_MODE_REFERENCE_TYPE, content: prompt, display: false }, { triggerTurn: true });
  emitDecision(ctx, { choice, title: current.title });
  return true;
}

/**
 * Report a resolved review to the console.
 *
 * The panel closes on THIS marker, not on the HTTP request returning: it stays
 * up while its decision is in flight, so a request that reached the child but
 * whose handler threw would otherwise leave the operator staring at a plan
 * nobody is waiting on. Every exit path emits it — including a failed save,
 * because the review is over either way.
 */
function emitDecision(ctx: ExtensionCtx, payload: { choice: string; title: string; failed?: boolean }): void {
  ctx.ui?.notify?.(`${CHAMBER_PLAN_DECISION_MARKER}${JSON.stringify(payload)}`, 'info');
}

export { PLAN_REVIEW_CHOICES };
