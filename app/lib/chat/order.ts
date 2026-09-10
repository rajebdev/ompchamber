import type { ChatMessageData } from '@/types';

/**
 * Normalizes system notice positions in a chat timeline.
 *
 * In OMP / AI agent execution flows, a system notice (such as multi-step reasoning,
 * ultrathink notice, or background job status) often arrives right before or
 * during turn transition. If a notice precedes a user message, it chronologically
 * belongs to the upcoming turn (responding to that user message).
 *
 * This function repositions any notice message that is immediately followed by a
 * `user` message so that it is rendered AFTER that user message (and immediately
 * before the next AI response).
 */
export function normalizeNoticePositions(messages: ChatMessageData[]): ChatMessageData[] {
  if (!messages || messages.length <= 1) return messages;

  const result: ChatMessageData[] = [...messages];
  let changed = true;

  // Bubble notices past any user messages that appear after them
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length - 1; i++) {
      const curr = result[i];
      const next = result[i + 1];

      // If current is a notice message (role !== 'user' and has notice)
      // and next is a user message, swap them so the user message comes first
      // and the notice is rendered right before the subsequent AI response.
      if (Boolean(curr.notice) && next.role === 'user') {
        result[i] = next;
        result[i + 1] = curr;
        changed = true;
      }
    }
  }

  return result;
}
