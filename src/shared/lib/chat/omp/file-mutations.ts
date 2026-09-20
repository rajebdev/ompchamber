/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-mutation signal: the chat event fold marks file-mutating tool calls
 * (edit / write / ast_edit / bash and their aliases) and, when one finishes,
 * the callbacks dispatch `omp:files-mutated`. Panels whose data lives on disk
 * (file explorer, git panel, context panel) listen through
 * `useFileMutationRefresh` and re-read out-of-band instead of waiting for
 * their next poll tick. Terminal, browser, and search panels stay untouched —
 * their data does not ride the AI response.
 */

import { isRecord } from '@/shared/lib/util/guards';
import { TOOL_ALIASES, asString } from '@/shared/lib/chat/timeline/tool-phrases';

/** Window event the fold dispatches after a file-mutating tool completes. */
export const FILE_MUTATION_EVENT = 'omp:files-mutated';

/** Canonical omp tool names whose completion can change files on disk. */
const FILE_MUTATING_BY_TOOL: Record<string, true> = {
  edit: true,
  write: true,
  ast_edit: true,
  bash: true,
};

/**
 * True when a `tool_execution_*` frame's tool can change workspace files.
 * `write` to an `xd://<device>` target mutates in-chamber state (AST proposals,
 * issue reports), never workspace files, so it does not count.
 */
export function isFileMutatingTool(frame: { toolName?: unknown; args?: unknown }): boolean {
  const raw = typeof frame.toolName === 'string' ? frame.toolName.toLowerCase() : '';
  const name = TOOL_ALIASES[raw] ?? raw;
  if (!FILE_MUTATING_BY_TOOL[name]) return false;
  const args = isRecord(frame.args) ? frame.args : {};
  const target = asString(args.path) ?? asString(args.target);
  return !(name === 'write' && typeof target === 'string' && target.startsWith('xd://'));
}
