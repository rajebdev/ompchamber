/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Inline card for omp's `ask` tool — the whole conversation with the user, in
 * the timeline instead of a modal.
 *
 * omp asks one question per dialog and blocks on it, so a modal could only ever
 * show the question in flight and lost every earlier one on the way; the card
 * keeps all of them in view, marks the ones already answered, and ends as the
 * summary of what the agent asked and what it was told.
 */

import { HelpCircle, XCircle } from 'lucide-preact';
import type { ToolCallData } from '@/shared/types';
import type { ExtensionUiDialogRequest } from '@/shared/types/omp/agent';
import { parseAskQuestions, parseAskResult } from '@/shared/lib/chat/ask-questions';
import { useAskFrames } from '@/client/hooks/chat/timeline/ask-frames';
import { liveFrame, useAskDrafts } from '@/client/components/workspace/chat-timeline/tool-renderers/ask-panel/drafts';
import { QuestionBlock } from '@/client/components/workspace/chat-timeline/tool-renderers/ask-panel/QuestionBlock';
import { FallbackOutput } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/FallbackOutput';

// Stable empties: fresh `[]` literals would defeat the question block's props.
const NO_FRAMES: ExtensionUiDialogRequest[] = [];
const NO_GROUPS: ExtensionUiDialogRequest[][] = [];
const NO_LABELS: string[] = [];

export function AskPanel({ tool }: { tool: ToolCallData }) {
  const questions = parseAskQuestions(tool);
  const recorded = parseAskResult(tool, questions);
  const { framesByTool, respond } = useAskFrames();
  const groups = framesByTool.get(tool.id) ?? NO_GROUPS;
  const { drafts, multiSelected, commit, toggleMulti } = useAskDrafts({
    toolId: tool.id,
    questions,
    groups,
    recorded,
    respond,
  });

  // An `ask` whose arguments the timeline never saw (or a non-questions shape)
  // still has a result worth showing.
  if (questions.length === 0) {
    return tool.output ? <FallbackOutput text={tool.output} /> : null;
  }

  const waiting = groups.some((frames, index) => frames.length > 0 && !recorded[index]);
  // omp asks in order and blocks on each, so the earliest question holding a
  // dialog is the only open one: everything before it is answered, whether or
  // not this client still has the text.
  const askingIndex = groups.findIndex((frames) => frames.length > 0);

  return (
    <div className="space-y-2">
      {waiting && (
        <div className="flex items-center gap-1.5 text-[10.5px] text-ink/50">
          <HelpCircle size={11} className="shrink-0" />
          <span>Input needed — the agent is blocked until you answer.</span>
        </div>
      )}

      {questions.map((question, index) => (
        <QuestionBlock
          key={question.id ?? index}
          index={index}
          total={questions.length}
          question={question}
          frames={groups[index] ?? NO_FRAMES}
          recorded={recorded[index] ?? null}
          draft={drafts[index]}
          passed={askingIndex !== -1 && index < askingIndex}
          multiSelected={multiSelected[index] ?? NO_LABELS}
          onAnswer={(value) => commit(index, value)}
          onToggle={(label) => toggleMulti(index, label)}
          onRespond={(response) => {
            const frame = liveFrame(groups, index);
            if (frame) respond(frame, response);
          }}
        />
      ))}

      {(tool.status === 'error' || tool.status === 'aborted') && tool.output && (
        <div className="flex items-start gap-2 rounded-md border border-ink/8 bg-ink/[0.02] px-2.5 py-1.5 text-[10.5px] text-ink/60">
          <XCircle size={11} className="mt-0.5 shrink-0 text-ink/40" />
          <span className="font-mono select-text">{tool.output}</span>
        </div>
      )}
    </div>
  );
}
