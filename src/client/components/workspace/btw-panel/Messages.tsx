/**
 * BTW panel message body — the scrollable turn list of the active topic.
 *
 * Pure presentation: the parent streams `liveAnswer` in and this file only
 * decides which text is current. No fetch, no session state.
 */

import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { BtwTopic, BtwTurnStatus } from '@/shared/types/btw';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';

export interface BtwMessagesProps {
  topic: BtwTopic | null;
  /** Partial text of the running turn ('' when none). */
  liveAnswer: string;
  /** Panel-level error line, surfaced above the turns. */
  error: string | null;
}

/** Status line under an answer that is not `complete`. */
function AnswerStatus({ status }: { status: BtwTurnStatus }) {
  if (status === 'complete') return null;

  if (status === 'running') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-ink/50">
        <span className="w-1.5 h-1.5 rounded-full bg-ink/40 animate-pulse" />
        <span>Thinking…</span>
      </div>
    );
  }

  if (status === 'cancelled') {
    return <div className="text-[11px] text-ink/50">Cancelled</div>;
  }

  return <div className="text-[11px] text-error">{status === 'failed' ? 'Failed' : 'Interrupted'}</div>;
}

export function BtwMessages({ topic, liveAnswer, error }: BtwMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const turns = topic?.turns ?? [];

  // Cheap scroll signal: any visible text growth (stream delta, new question,
  // topic switch) changes this number.
  const renderedLength = useMemo(
    () => turns.reduce((total, turn) => total + turn.question.length + turn.answer.length, 0) + liveAnswer.length,
    [turns, liveAnswer],
  );

  useEffect(() => {
    const body = scrollRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [renderedLength]);

  const lastIndex = turns.length - 1;

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto scrollbar-overlay-container scrollbar-overlay-static px-4 py-3 space-y-4"
    >
      {error && (
        <div className="bg-error/10 border border-error/30 text-error rounded-lg px-3 py-2 text-[12px]">{error}</div>
      )}

      {topic === null ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-ink/50">
          Start a side question — the answer stays out of this chat's transcript.
        </div>
      ) : (
        turns.map((turn, index) => {
          // The streamed text wins while the newest turn is live: either it is
          // still running, or it already outgrew the last flushed answer.
          const streaming =
            index === lastIndex &&
            liveAnswer !== '' &&
            (turn.status === 'running' || liveAnswer.length > turn.answer.length);
          const answer = streaming ? liveAnswer : turn.answer;

          return (
            <div key={turn.index} className="space-y-2">
              <div className="ml-auto max-w-[85%] w-fit bg-ink/[0.06] border border-ink/10 rounded-xl px-3.5 py-2.5 text-[13px] text-ink break-words">
                <MarkdownRenderer content={turn.question} />
              </div>

              {answer !== '' && (
                <div className="px-1 text-[13px] text-ink leading-relaxed">
                  <MarkdownRenderer content={answer} />
                </div>
              )}

              <AnswerStatus status={turn.status} />
            </div>
          );
        })
      )}
    </div>
  );
}
