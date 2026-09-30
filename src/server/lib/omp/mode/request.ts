/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The chamber's plan/goal control channel.
 *
 * Every mode action is an ordinary `/chamber-mode <scope> <action> [json]`
 * prompt sent to the live child, where the chamber-owned extension executes it
 * locally. Three properties make that the right transport, and all three are
 * measured rather than assumed:
 *
 *  - it reaches the live `AgentSession`, which no RPC verb does for either
 *    mode;
 *  - it costs no transcript: the command answers `agentInvoked: false` and
 *    writes no user message, so toggling Plan five times leaves no bubbles;
 *  - it needs no respawn. The extension re-applies both flags in-process, so a
 *    live session is re-targeted instantly — unlike `--approval-mode`, which is
 *    a spawn-time flag and forces the destroy-and-respawn dance.
 *
 * The payload is JSON because an objective is free-form text: spaces,
 * punctuation and newlines all have to survive one line of prompt.
 */

import { isRecord } from '@/shared/lib/util/guards';
import type { ChamberModeSelection } from '@/shared/lib/omp/mode/types';

export type ModeScope = 'plan' | 'goal';

export interface ModeRequest {
  scope: ModeScope;
  action: string;
  payload?: Record<string, unknown>;
}

/** Parse a `chamber_mode` request body. Returns null when the shape is wrong,
 *  so the route answers a 400 instead of forwarding a command the extension
 *  would reject with a notice. */
export function parseModeRequest(body: Record<string, unknown>): ModeRequest | null {
  const scope = body.scope;
  const action = body.action;
  if (scope !== 'plan' && scope !== 'goal') return null;
  if (typeof action !== 'string' || !action.trim()) return null;
  const payload = isRecord(body.payload) ? body.payload : undefined;
  return { scope, action: action.trim(), payload };
}

/** Render the prompt that carries a mode request to the extension.
 *
 *  One line, always: the command token ends at the first whitespace run, and a
 *  newline inside the JSON would end the prompt's argument region instead of
 *  the string it belongs to. `JSON.stringify` escapes newlines, which is the
 *  whole reason the payload is JSON rather than `key=value` pairs. */
export function modeCommandPrompt(request: ModeRequest): string {
  const payload = request.payload && Object.keys(request.payload).length > 0 ? ` ${JSON.stringify(request.payload)}` : '';
  return `/chamber-mode ${request.scope} ${request.action}${payload}`;
}

/** A selection parsed from a client request body. Absent flags mean "off", so
 *  a partial body can never silently leave a mode on. */
export function parseModeSelection(body: Record<string, unknown>): ChamberModeSelection {
  return { plan: body.plan === true, goal: body.goal === true };
}

/** The extension's `CHAMBER_MODES` value for a selection. */
export function modeEnvValue(selection: ChamberModeSelection): string {
  return [selection.plan ? 'plan' : '', selection.goal ? 'goal' : ''].filter(Boolean).join(',');
}
