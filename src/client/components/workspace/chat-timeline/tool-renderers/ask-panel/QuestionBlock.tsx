/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One question of an `ask` call, in whichever of its three states it is in:
 * answered (omp already recorded it), asking (its dialog is live) or still
 * queued behind an earlier question — omp asks them strictly in order, so the
 * later ones can only be previewed until their turn comes.
 */

import { CheckCircle2, Clock } from 'lucide-preact';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';
import type { ExtensionUiDialogRequest } from '@/shared/types/omp/agent';
import type { AskAnswer, AskQuestion } from '@/shared/lib/chat/ask-questions';
import { FrameControl } from '@/client/components/workspace/chat-timeline/tool-renderers/ask-panel/FrameControl';
import type { ExtensionDialogResponse } from '@/client/components/workspace/chat-timeline/tool-renderers/extension-dialog/Lazy';

interface QuestionBlockProps {
  index: number;
  total: number;
  question: AskQuestion;
  /** Dialogs this question raised, oldest first; the last one is live. */
  frames: ExtensionUiDialogRequest[];
  recorded: AskAnswer | null;
  /** Answer picked locally for a question omp has not reached yet. */
  draft?: string;
  /** Unanswered, but omp has already moved past it — its dialog is gone. */
  passed: boolean;
  /** Labels toggled locally on a multi-select question. */
  multiSelected: string[];
  onAnswer: (value: string) => void;
  onToggle: (label: string) => void;
  onRespond: (response: ExtensionDialogResponse) => void;
}

function answerParts(answer: AskAnswer): string[] {
  const parts = [...answer.selectedOptions];
  if (answer.customInput) parts.push(answer.customInput);
  return parts;
}

export function QuestionBlock({
  index,
  total,
  question,
  frames,
  recorded,
  draft,
  passed,
  multiSelected,
  onAnswer,
  onToggle,
  onRespond,
}: QuestionBlockProps) {
  const live = frames.length > 0 ? frames[frames.length - 1] : null;
  const answered = recorded ? answerParts(recorded) : draft ? [draft] : multiSelected;
  const asking = Boolean(live) && !recorded && (question.multi || !draft);

  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-2.5 shadow-xs">
      <div className="flex items-start gap-2">
        <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded bg-ink/5 font-mono text-[9px] font-semibold text-ink/60">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-ink/40">
              {question.header ?? `Question ${index + 1}`}
            </span>
            {question.multi && (
              <span className="rounded-full bg-ink/5 px-1.5 py-px font-mono text-[8.5px] text-ink/45">multi</span>
            )}
            {total > 1 && (
              <span className="ml-auto font-mono text-[9px] text-ink/35">
                {index + 1}/{total}
              </span>
            )}
          </div>

          <div className="mt-1 text-[12.5px] leading-relaxed text-ink/90 select-text">
            <MarkdownRenderer content={question.question} />
          </div>

          {asking && live && (
            <FrameControl
              frame={live}
              multi={question.multi}
              selected={multiSelected}
              onAnswer={onAnswer}
              onToggle={onToggle}
              onRespond={onRespond}
            />
          )}

          {answered.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <CheckCircle2 size={11} className="shrink-0 text-success" />
              {answered.map((part) => (
                <span
                  key={part}
                  className="rounded-md border border-ink/12 bg-canvas/40 px-2 py-0.5 text-[11.5px] font-medium text-ink select-text"
                >
                  {part}
                </span>
              ))}
              {recorded?.timedOut && (
                <span className="rounded-full bg-ink/5 px-1.5 py-px font-mono text-[9px] text-ink/45">
                  auto-selected on timeout
                </span>
              )}
            </div>
          )}

          {!asking && answered.length === 0 && passed && (
            <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-ink/45">
              <CheckCircle2 size={11} className="shrink-0 text-ink/35" />
              <span>Answered earlier in this run.</span>
            </div>
          )}

          {!asking && answered.length === 0 && !passed && (
            <div className="mt-2 space-y-1 border-t border-ink/6 pt-2">
              {question.options.map((option, optionIndex) => (
                <div key={option.label} className="flex items-start gap-2 px-0.5 text-[11.5px] text-ink/45">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-ink/20" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {option.label}
                      {question.recommended === optionIndex && (
                        <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-ink/35">
                          suggested
                        </span>
                      )}
                    </span>
                    {option.description && (
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-ink/35">
                        {option.description}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 pt-0.5 text-[10.5px] text-ink/40">
                <Clock size={10} className="shrink-0" />
                <span>Waiting for the previous answer…</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
