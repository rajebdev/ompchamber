/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `/btw [question]` typed into the main composer is the side-question entry
 * point, not chat text: the panel owns the token (omp's `/btw` is TUI-only, so
 * nothing downstream would understand it). This module is the whole
 * interception — recognize the command, carry the composer's images across as
 * provider payloads, and hand the question to the panel over `omp:btw`.
 *
 * It lives beside the rest of the client-side btw state (`hooks/chat/btw/`)
 * rather than in the send handler: the attachment read goes through the shared
 * accessors, because `Attachment.file` is absent on every replayed attachment.
 */

import type { Attachment } from '@/shared/types';
import { attachmentImage } from '@/shared/lib/chat/attachments';

/** A bare `/btw` opens the form on the current history; anything after it is
 *  the first question. Case-insensitive, because omp's command tokens are. */
const BTW_COMMAND_RE = /^\/btw(?:\s+([\s\S]*))?$/i;

/**
 * Hand a `/btw` draft to the side-question panel. Returns false when the text
 * is not a btw command, so the caller keeps its normal send path.
 */
export function dispatchBtwCommand(text: string, attachments: Attachment[]): boolean {
  const match = BTW_COMMAND_RE.exec(text);
  if (!match) return false;

  const images = attachments
    .map((attachment) => attachmentImage(attachment))
    .filter((image): image is NonNullable<typeof image> => image !== null);

  window.dispatchEvent(
    new CustomEvent('omp:btw', {
      detail: { question: match[1]?.trim() ?? '', ...(images.length ? { images } : {}) },
    }),
  );
  return true;
}
