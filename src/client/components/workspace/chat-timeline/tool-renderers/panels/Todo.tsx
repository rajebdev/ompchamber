import { useMemo } from 'preact/hooks';
import { CheckCircle2, ListTodo, Loader2, Square } from 'lucide-preact';
import type { ToolCallData } from '@/shared/types';
import { parseTodoData } from '@/shared/lib/chat/todo-parser';
import { FallbackOutput } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/FallbackOutput';

/** Panel khusus untuk tool `todo` — task list dengan progress bar, phase groups, dan status yang readable. */
export function Todo({ tool }: { tool: ToolCallData }) {
  const { groups, totalDone, totalInProgress, totalPending, totalTasks, opBadge } = useMemo(
    () => parseTodoData(tool),
    [tool]
  );

  if (groups.length === 0 && !opBadge) {
    const rawOutput = tool.output || '';
    if (!rawOutput.trim()) return null;
    return <FallbackOutput text={rawOutput} />;
  }

  const pct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <div className="space-y-2">
      {/* Header with progress and status pills */}
      <div className="rounded-lg border border-ink/8 bg-paper p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListTodo size={13} className="text-ink/60" />
            <span className="text-[11px] font-semibold text-ink">Todo</span>
            {opBadge && (
              <span className="rounded bg-success/10 px-2 py-0.5 font-mono text-[9.5px] font-medium text-success">
                {opBadge}
              </span>
            )}
          </div>
          {totalTasks > 0 && (
            <div className="flex items-center gap-2 font-mono text-[10.5px]">
              <span className="text-ink/50">
                {totalDone} of {totalTasks} completed
              </span>
              <span className="rounded bg-ink/5 px-1.5 py-0.2 font-semibold text-ink">
                {pct}%
              </span>
            </div>
          )}
        </div>

        {/* Counter Pills: complete, in progress, pending (only show > 0) */}
        {totalTasks > 0 && (totalDone > 0 || totalInProgress > 0 || totalPending > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            {totalDone > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-success/10 px-2 py-0.5 text-success">
                <CheckCircle2 size={11} />
                <span>{totalDone} complete</span>
              </span>
            )}
            {totalInProgress > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-ink/8 px-2 py-0.5 text-ink/70">
                <Loader2 size={11} className="animate-spin" />
                <span>{totalInProgress} in progress</span>
              </span>
            )}
            {totalPending > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-ink/5 px-2 py-0.5 text-ink/50">
                <Square size={11} />
                <span>{totalPending} pending</span>
              </span>
            )}
          </div>
        )}

        {totalTasks > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8">
            <div
              className="h-full rounded-full bg-success transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {/* Task Groups */}
      <div className="space-y-2">
        {groups.map((group, gIdx) => (
          <div key={gIdx} className="overflow-hidden rounded-lg border border-ink/8 bg-paper">
            <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/40 px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                {group.phase}
              </span>
              <span className="font-mono text-[9.5px] text-ink/40">
                {group.tasks.filter((t) => t.status === 'done').length}/{group.tasks.length}
              </span>
            </div>

            <div className="divide-y divide-ink/[0.04] p-1">
              {group.tasks.map((task, tIdx) => {
                const isDone = task.status === 'done';
                const isInProgress = task.status === 'in_progress';

                return (
                  <div
                    key={tIdx}
                    className={`flex items-start gap-2.5 px-2.5 py-1.5 text-[11.5px] transition-colors ${
                      isInProgress ? 'bg-ink/[0.03]' : ''
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" />
                    ) : isInProgress ? (
                      <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-ink" />
                    ) : (
                      <Square size={13} className="mt-0.5 shrink-0 text-ink/25" />
                    )}

                    <span
                      className={`min-w-0 flex-1 leading-snug ${
                        isDone
                          ? 'text-ink/40 line-through'
                          : isInProgress
                            ? 'font-medium text-ink'
                            : 'text-ink/80'
                      }`}
                    >
                      {task.text}
                    </span>

                    {isInProgress && (
                      <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-ink/70">
                        In Progress
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
