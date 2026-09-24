/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Spawn arguments for a topic's side child.
 *
 * The side child is an ordinary `omp --mode rpc-ui` that resumes the topic's
 * transcript. It runs WITH tools (unlike the TUI's `/btw`, which passes
 * `--no-tools`): the panel exposes a real access-control dropdown, and an
 * approval mode that governs nothing is a lie in the UI. What the child may
 * actually do is therefore the `--approval-mode` flag's business, exactly as it
 * is for a chat session.
 *
 * `--no-title` stays: auto-titling would spend a model call on a transcript
 * nobody lists in the sidebar.
 */

import type { ApprovalMode } from '@/shared/lib/omp/config/access-mode';
import type { BtwModel } from '@/shared/types';

export interface BtwSpawnSettings {
  model?: BtwModel;
  /** omp's own default when absent (`auto`). */
  thinkingLevel?: string;
  /** Spawn-time only: omp exposes no RPC to change the approval mode. */
  approvalMode?: ApprovalMode;
}

export function buildBtwSpawnArgs(sessionFile: string, settings: BtwSpawnSettings): string[] {
  const args = ['--resume', sessionFile, '--no-title'];
  if (settings.model) args.push('--model', `${settings.model.provider}/${settings.model.id}`);
  // 'auto' means "leave omp's level alone" — the same rule the composer applies,
  // so it is omitted rather than translated into a concrete level.
  if (settings.thinkingLevel && settings.thinkingLevel !== 'auto') {
    args.push('--thinking', settings.thinkingLevel);
  }
  if (settings.approvalMode) args.push('--approval-mode', settings.approvalMode);
  return args;
}
