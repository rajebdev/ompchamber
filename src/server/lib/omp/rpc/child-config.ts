/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The commands a freshly-spawned child is configured with, before any prompt.
 *
 * Split out of `manager.ts` (which is at the repo's per-file ceiling) so the
 * attach sequence reads as one list rather than being interleaved with the
 * wrapper's own state. Each entry is BEST-EFFORT: an older omp answers
 * `Unknown command` and the run continues on that build's defaults, which is
 * why none of them may throw.
 *
 * `set_event_filter` is the one with a measurable payoff. Without it omp
 * re-sends the WHOLE accumulated message on every token; with
 * `messageUpdates: "delta"` each frame carries only the new fragment. Measured
 * on one 300-word prompt: 10.9 MB / 2217 frames against 108 KB / 486 — ~101x.
 * The client rebuilds the accumulated shape (`shared/lib/chat/omp/
 * delta-accumulator.ts`), and the terminal frames (`message_start`,
 * `message_end`, `turn_end`, `agent_end`) carry the full message either way, so
 * nothing else on either side changes.
 */

import type { RpcProcess } from '@/server/lib/omp/rpc/process';

/** Apply the attach-time configuration to a child that just became ready. */
export async function configureChild(proc: RpcProcess): Promise<void> {
  // Subagent lifecycle/progress/event frames, so the UI can show a live roster.
  await proc.sendCommand({ type: 'set_subagent_subscription', level: 'events' }).catch(() => {});
  // Delta `message_update` frames (see the module doc for the measurement).
  await proc.sendCommand({ type: 'set_event_filter', events: null, messageUpdates: 'delta' }).catch(() => {});
  // Grouped `ask` dialogs: every question of one `ask` tool call in a SINGLE
  // `extension_ui_request` (`method:"ask"`, with `multi`/`recommended`), answered
  // by one `answers` response. Without this omp loops one `select` per question,
  // which is what the ask card's per-question bookkeeping exists to reassemble.
  // Verified on 18.8.3: two questions (one `multi`) arrived in one request.
  await proc.sendCommand({ type: 'set_ask_dialog', enabled: true }).catch(() => {});
}
