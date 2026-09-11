import { useEffect, useRef } from 'react';
import { ArrowLeft, Bot, Loader2, Lock } from 'lucide-react';
import type { SubagentInfo } from '@/types';
import { SubagentStatusIcon } from '@/components/common/SubagentStatusIcon';
import { ChatMessageItem } from '@/components/workspace/chat-timeline/MessageItem';
import { useSubagentTranscript } from '@/hooks/chat/subagent';

interface SubagentViewProps {
  sessionId: string | null;
  subagent: SubagentInfo | null;
  onBack: () => void;
  className?: string;
}

const STATUS_LABEL: Record<SubagentInfo['status'], string> = {
  started: 'running',
  completed: 'done',
  failed: 'failed',
  aborted: 'aborted',
};

function formatTokens(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${Math.round(n)} tok`;
}

/** Read-only subagent transcript: compact banner, live-growing message list,
 *  and a notice row where the main timeline's composer would be. */
export function SubagentView({ sessionId, subagent, onBack, className = '' }: SubagentViewProps) {
  const { messages, isLoading, status, isActive } = useSubagentTranscript(sessionId, subagent, onBack);
  const scrollRef = useRef<HTMLDivElement>(null);

  const effectiveStatus = status?.status ?? subagent?.status ?? 'started';
  const isRunning = effectiveStatus === 'started';

  // Auto-scroll to the newest row as the transcript grows (main timeline parity).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, isRunning]);

  if (!subagent || !isActive) return null;

  const progress = status?.progress ?? subagent.progress;
  const modelName = progress?.resolvedModel ?? subagent.agent;
  const meta = formatTokens(progress?.tokens);
  const rawTask = status?.task ?? status?.assignment ?? status?.description
    ?? subagent.task ?? subagent.assignment ?? subagent.description;
  const task = rawTask ? rawTask.replace(/\$0(\.00*)?/g, '').trim() : undefined;

  return (
    <div className={`flex flex-col h-full min-h-0 overflow-hidden bg-canvas ${className}`}>
      {/* Banner: back, live status, agent identity, at-a-glance usage */}
      <div className="flex items-center gap-2.5 border-b border-ink/15 bg-paper px-3 py-2 flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          title="Back to session"
          className="flex items-center justify-center w-7 h-7 rounded-md border border-ink/15 text-ink/70 hover:text-ink hover:bg-ink/5 transition-colors shrink-0 cursor-pointer"
        >
          <ArrowLeft size={14} />
        </button>
        <SubagentStatusIcon status={effectiveStatus} live={isRunning} size={12} />
        <Bot size={13} className="text-ink/60 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[12px] font-semibold text-ink truncate">
              {status?.agent ?? subagent.agent}
            </span>
            <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/50">
              {STATUS_LABEL[effectiveStatus]}
            </span>
          </div>
          <p className="truncate text-[11px] text-ink/55 font-sans">
            {task ?? 'Subagent transcript'}
          </p>
        </div>
        {meta && (
          <span className="hidden sm:inline shrink-0 font-mono text-[10px] text-ink/45">
            {meta}
          </span>
        )}
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-overlay-container timeline-scrollbar-visible p-4 pb-10"
      >
        <div className="mx-auto w-full max-w-[970px]">
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[11px] font-mono text-ink/50">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading transcript…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-12 text-center text-[11.5px] font-mono text-ink/45">
              No transcript messages yet.
            </div>
          ) : (
            messages.map((msg, idx) => {
              let lastAiIdx = messages.length - 1;
              while (lastAiIdx >= 0 && messages[lastAiIdx].notice) lastAiIdx--;
              const isLoading = isRunning && idx === lastAiIdx && msg.role !== 'user' && !msg.notice;
              const nextReal = messages.slice(idx + 1).find((m) => !m.notice);
              const isLastAi = msg.role !== 'user' && !msg.notice && (!nextReal || nextReal.role === 'user');
              let prevRealIdx = idx - 1;
              while (prevRealIdx >= 0 && messages[prevRealIdx].notice) prevRealIdx--;
              const prevReal = prevRealIdx >= 0 ? messages[prevRealIdx] : null;
              const isPrevAssistant = Boolean(msg.role !== 'user' && prevReal && prevReal.role !== 'user');

              return (
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  modelName={msg.model || modelName}
                  isStreaming={isLoading}
                  footerVisible={isLastAi}
                  durationMs={msg.durationMs ?? null}
                  isPrevAssistant={isPrevAssistant}
                  className={msg.notice ? 'mt-3 mb-1' : isPrevAssistant ? 'mt-1' : 'mt-3'}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Read-only notice in place of the composer */}
      <div className="flex-shrink-0 p-4 pt-1">
        <div className="mx-auto w-full max-w-[970px]">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-ink/15 bg-paper px-3 py-2 text-[11px] font-mono text-ink/50 select-none">
            <Lock size={11} className="text-ink/45" />
            <span>Read-only transcript — subagents cannot receive messages</span>
          </div>
        </div>
      </div>
    </div>
  );
}
