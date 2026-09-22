/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prompt assembly for the chamber composer: rewrite composer-level mentions
 * into what oh-my-pi actually receives, then inline the text attachments the
 * user dropped in. Extracted from the send path so that hook stays under the
 * repo's per-file size ceiling.
 */

import { composeMessageWithTextAttachments } from '@/shared/lib/chat/attachments';
import { loadAgentNames } from '@/shared/lib/chat/composer/client';
import { translateAgentMentions, translateFileMentions } from '@/shared/lib/chat/composer/translate';

type TextFileAttachment = Parameters<typeof composeMessageWithTextAttachments>[1][number];

/**
 * Build the outgoing prompt. `@agent` mentions are rewritten into an explicit
 * task-tool delegation directive at send time (oh-my-pi has no `@agent`
 * syntax); translation failures fall back to the raw prompt.
 */
export async function buildPromptText(text: string, textFiles: TextFileAttachment[]): Promise<string> {
  let translated = text;
  try {
    const names = await loadAgentNames();
    if (names.length > 0) translated = translateAgentMentions(text, names).text;
  } catch {
    // keep the raw prompt
  }
  // File mentions are namespaced (`@file:`) by the picker; strip the namespace
  // only after the agent pass so `@file:<name>` is never mistaken for `@agent`.
  return composeMessageWithTextAttachments(translateFileMentions(translated), textFiles);
}
