/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Run-footer placement for the chat timeline. The model/duration/token footer
 * closes an AI response run, so it is emitted at the run's boundary — after
 * every row the run owns, including notice rows omp wrote at its tail, and
 * therefore immediately before the next user message. Nothing here reorders
 * rows: the timeline renders file order and the footer is an extra row placed
 * after the run's last one.
 *
 * "Notice row" means a real notice card: a row whose `notice` carries the
 * answer instead is an ordinary AI row and owns its run (chat/notice-row.ts).
 */

import { responseRunDurationMs } from '@/shared/lib/chat/duration';
import { isNoticeRow } from '@/shared/lib/chat/notice-row';
import type { ChatMessageData } from '@/shared/types';

export interface RunFooterSlot {
  /** The run's last real AI message — the row carrying model/usage/duration. */
  msg: ChatMessageData;
  /** Index of that message, i.e. the row that streams during generation. */
  ownerIndex: number;
  /** Measured run span, falling back to the turn's own recorded duration. */
  durationMs: number | null;
}

/**
 * The row that streams while generating: the last non-notice row. Notice rows
 * sit after the turn, so a plain "last item" check would mark a notice as the
 * streaming row and settle the footer early.
 */
export function streamingRowIndex(messages: ChatMessageData[]): number {
  let index = messages.length - 1;
  while (index >= 0 && isNoticeRow(messages[index])) index--;
  return index;
}

/**
 * `previousNonNoticeIndex[idx]`: nearest non-notice row index strictly BEFORE
 * idx, or -1 when none. Rows use it to tell an assistant continuation from a
 * fresh turn without re-scanning the timeline per row.
 */
export function previousNonNoticeIndex(messages: ChatMessageData[]): number[] {
  const indexes: number[] = new Array(messages.length);
  let prevIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    indexes[i] = prevIdx;
    if (!isNoticeRow(messages[i])) prevIdx = i;
  }
  return indexes;
}

/**
 * One entry per timeline index: non-null when a run footer renders AFTER that
 * row. A run is a maximal stretch of non-user rows; its footer lands on the
 * run's last row, so trailing notice rows no longer separate the footer from
 * the following user message. A notice-only run gets none (no AI message to
 * describe), and a run that is still generating is skipped until it settles.
 */
export function resolveRunFooters(
  messages: ChatMessageData[],
  isGenerating: boolean,
): (RunFooterSlot | null)[] {
  const count = messages.length;
  const footers: (RunFooterSlot | null)[] = new Array(count).fill(null);
  const streamingIdx = streamingRowIndex(messages);
  let ownerIndex = -1;

  for (let i = 0; i < count; i++) {
    const msg = messages[i];
    if (msg.role === 'user') {
      ownerIndex = -1;
      continue;
    }
    if (!isNoticeRow(msg)) ownerIndex = i;

    const endsRun = i === count - 1 || messages[i + 1]?.role === 'user';
    if (!endsRun || ownerIndex < 0) continue;

    const owner = messages[ownerIndex];
    // The answer is still streaming — no footer until the run settles.
    if (isGenerating && ownerIndex === streamingIdx && owner.role === 'ai') continue;

    footers[i] = {
      msg: owner,
      ownerIndex,
      durationMs: responseRunDurationMs(messages, ownerIndex) ?? owner.durationMs ?? null,
    };
  }

  return footers;
}
