/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plan review: the five ways out of a parked `xd://propose`.
 *
 * The parked proposal itself — its slot, its plan body, and the releases that
 * are not a decision (teardown, refinement) — lives in `parked.ts`. This module
 * owns the CHOICES, because they are omp's own five and each one does something
 * different to the session.
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
  awaitParkedProposal,
  parkProposal,
  peekParkedProposal,
  readPlanFile,
  releaseParkedProposal,
  takeParkedProposal,
} from './parked';
import {
  CHAMBER_PLAN_DECISION_MARKER,
  CHAMBER_PLAN_PROPOSAL_MARKER,
  CHAMBER_PLAN_SAVED_MARKER,
  CHAMBER_PLAN_STATE_MARKER,
  PLAN_REVIEW_CHOICES,
} from './protocol';

/** Custom-message type the approved plan rides as, mirroring omp's own
 *  `plan-mode-reference` bookkeeping so a transcript reads the same either way. */
const PLAN_MODE_REFERENCE_TYPE = 'plan-mode-reference';

export { awaitParkedProposal };

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
    // No timer: the review waits as long as the operator takes, the same way
    // `ask` does (`ask.timeout` defaults to 0). See `parked.ts` for why the
    // 30-minute refinement this used to arm was the wrong escape hatch.
    const { promise, resolve } = Promise.withResolvers<unknown>();
    parkProposal({ title: resolvedTitle, planFilePath, planContent, resolve });
    ctx.ui?.notify?.(
      `${CHAMBER_PLAN_PROPOSAL_MARKER}${JSON.stringify({ title: resolvedTitle, planFilePath, planContent, details })}`,
      'info',
    );
    return promise;
  });
}

/**
 * Re-emit the marker for the proposal already parked.
 *
 * The proposal reaches the console exactly once, as a notice frame on the
 * stream, and a page that reloads while the review is open has no other way to
 * learn the request id — omp never re-delivers the frame, and the plan body
 * lives only in this slot. The client asks for this on attach, which is why it
 * costs nothing when no plan is parked: the answer is a boolean the caller
 * turns into "no plan is awaiting review".
 *
 * The body is NOT re-read from disk: the parked copy is what the operator was
 * shown, and re-reading could hand them a different plan than the model is
 * waiting on.
 */
export function republishParkedProposal(ctx: ExtensionCtx): boolean {
  const current = peekParkedProposal();
  if (!current) return false;
  ctx.ui?.notify?.(
    `${CHAMBER_PLAN_PROPOSAL_MARKER}${JSON.stringify({
      title: current.title,
      planFilePath: current.planFilePath,
      planContent: current.planContent,
    })}`,
    'info',
  );
  return true;
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
  const current = takeParkedProposal();
  if (!current) return false;

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
