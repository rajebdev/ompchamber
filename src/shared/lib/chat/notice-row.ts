/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `notice` rows — and the one case where the field carries the ANSWER.
 *
 * A real notice row holds nothing but the notice: omp writes harness reminders,
 * task results and late diagnostics as their own entry, so those rows have no
 * model, no usage and no thinking. When the assistant's answer itself ends up
 * in `notice` (omp diverted the turn's text block), the row keeps the turn's
 * own metadata — model/provider/usage/duration/thinking/toolCalls — and is
 * therefore an answer that must render as text, never as a System Notice card.
 *
 * The decision lives here once so every consumer agrees: the timeline row
 * (`MessageItem`), the boundary rules of the run footer, and the live-stream
 * callbacks.
 */

import type { ChatMessageData } from '@/shared/types';
import { isReminderTag, unwrapXmlEnvelope } from '@/shared/lib/chat/xml-envelope';

/** Tag that identifies a notice payload rather than prose. A notice keeps its
 *  wrapper — that tag is the field's identity, and `SystemNotice` reads it to
 *  pick "System Reminder" / "Task Result" over the generic card. */
const NOTICE_TAG_RE = /<\/?(?:system-reminder|reminder|system-notice|task-result)\b/i;

/** Fields only a real assistant turn carries. `thinkingLevel` is deliberately
 *  absent: the live stream stamps it on every non-user frame, notice rows
 *  included, so it proves nothing about the row being an answer. */
const TURN_FIELDS = [
  'model',
  'provider',
  'usage',
  'durationMs',
  'startedAt',
  'completedAt',
  'thinking',
  'toolCalls',
] as const;

/**
 * Index of the text part that IS a reminder envelope — `undefined` when the
 * turn's prose merely quotes the tag (`see <system-reminder> handling` is
 * content, not a wrapper). The envelope must open the part and enclose a whole
 * element, so both statuses of a reminder turn are distinguishable before
 * anything is moved into `notice`.
 */
export function reminderPartIndex(parts: string[]): number | undefined {
  const index = parts.findIndex((part) => {
    const envelope = unwrapXmlEnvelope(part);
    return envelope !== undefined && isReminderTag(envelope.tag);
  });
  return index === -1 ? undefined : index;
}

/** True when the row's `notice` is the assistant answer omp diverted there. */
export function noticeIsAssistantText(
  msg: ChatMessageData | null | undefined,
): msg is ChatMessageData & { notice: string } {
  if (typeof msg?.notice !== 'string' || !msg.notice.trim()) return false;
  if (NOTICE_TAG_RE.test(msg.notice)) return false;
  return TURN_FIELDS.some((field) => msg[field] !== undefined && msg[field] !== null);
}

/** True when the row renders as a notice card (a real notice, not an answer). */
export function isNoticeRow(
  msg: ChatMessageData | null | undefined,
): msg is ChatMessageData & { notice: string } {
  return typeof msg?.notice === 'string' && Boolean(msg.notice.trim()) && !noticeIsAssistantText(msg);
}

/** The row's answer text: `content`, or the notice when the answer landed there. */
export function messageAnswerText(msg: ChatMessageData | null | undefined): string {
  if (noticeIsAssistantText(msg)) return msg.notice;
  return typeof msg?.content === 'string' ? msg.content : '';
}
