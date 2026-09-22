/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Routes omp's pending answerable dialogs to their renderer.
 *
 * `ask` dialogs belong on the tool card that raised them — a modal would hide
 * every question but the one in flight, and the tool's own result (all questions
 * and their answers) is what the user reads afterwards. Everything else
 * (approval gates under `always-ask`, extension pickers) has no card of its own
 * and keeps the modal.
 *
 * The two are told apart by the running ask tool calls: a frame whose title
 * names one of their questions is theirs, and a frame that follows such a frame
 * (the `editor` omp opens after "Other (type your own)") belongs with it too.
 * Any frame left over is modal material — including an ask-shaped frame whose
 * tool call the timeline has not seen, which must stay answerable rather than
 * silently vanish.
 */

import { createContext, useContext } from 'preact/compat';
import type { ChatMessageData } from '@/shared/types';
import type { ExtensionUiDialogRequest } from '@/shared/types/omp/agent';
import { groupAskFrames, isAskToolCall, normalizeAskText, parseAskQuestions, type AskQuestion } from '@/shared/lib/chat/ask-questions';
import type { ExtensionDialogResponse } from '@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/Lazy';

export interface AskFramesSplit {
  /** The ask's dialogs, bucketed per question, keyed by ask tool-call id. */
  framesByTool: Map<string, ExtensionUiDialogRequest[][]>;
  /** Oldest request no ask card owns — the one the modal renders, if any. */
  modalRequest: ExtensionUiDialogRequest | null;
}

export interface AskFramesHandle {
  framesByTool: AskFramesSplit['framesByTool'];
  /** Answer one ask dialog and drop it from the pending queue. */
  respond: (request: ExtensionUiDialogRequest, response: ExtensionDialogResponse) => void;
}

const EMPTY: AskFramesHandle = { framesByTool: new Map(), respond: () => {} };

export const AskFramesContext = createContext<AskFramesHandle>(EMPTY);

/** Pending ask dialogs for the timeline that provides them. */
export function useAskFrames(): AskFramesHandle {
  return useContext(AskFramesContext);
}

export function splitAskFrames(
  messages: ChatMessageData[],
  pending: ExtensionUiDialogRequest[],
): AskFramesSplit {
  const framesByTool = new Map<string, ExtensionUiDialogRequest[][]>();
  if (pending.length === 0) return { framesByTool, modalRequest: null };

  // Match against EVERY ask the timeline knows, not just the running ones: a
  // reloaded session reads its tool calls back from the JSONL, where a call
  // still parked on a question has no result yet and so cannot be told from a
  // finished one. The pending queue is the part that is authoritative — it only
  // ever holds frames omp is still blocked on — so a title match is enough.
  const openAsks = new Map<string, AskQuestion[]>();
  for (const message of messages) {
    for (const tool of message.toolCalls ?? []) {
      if (!isAskToolCall(tool)) continue;
      const questions = parseAskQuestions(tool);
      if (questions.length > 0) openAsks.set(tool.id, questions);
    }
  }

  const owned = new Map<string, ExtensionUiDialogRequest[]>();
  const claimed = new Set<ExtensionUiDialogRequest>();
  let lastOwner: string | null = null;

  for (const request of pending) {
    const title = typeof request.title === 'string' ? normalizeAskText(request.title) : '';
    let owner: string | null = null;
    if (title) {
      for (const [toolId, questions] of openAsks) {
        if (questions.some((question) => normalizeAskText(question.question) === title)) {
          owner = toolId;
          break;
        }
      }
    }
    // The dialog omp opens after "Other (type your own)" names the question in
    // its title only loosely; it continues whichever ask spoke last. An
    // approval gate is never part of an ask, so it keeps its own modal.
    if (!owner && request.method !== 'confirm') owner = lastOwner;
    if (!owner) continue;
    claimed.add(request);
    lastOwner = owner;
    owned.set(owner, [...(owned.get(owner) ?? []), request]);
  }

  for (const [toolId, frames] of owned) {
    framesByTool.set(toolId, groupAskFrames(openAsks.get(toolId) ?? [], frames));
  }

  return { framesByTool, modalRequest: pending.find((request) => !claimed.has(request)) ?? null };
}
