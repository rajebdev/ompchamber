import { useMemo } from 'react';
import { Square, Loader2, CheckCircle2, ListTodo } from 'lucide-react';
import type { ToolCallData } from '@/types';

interface ParsedTask {
  text: string;
  status: 'done' | 'in_progress' | 'pending';
  phase?: string;
}

interface ParsedPhaseGroup {
  phase: string;
  tasks: ParsedTask[];
}

function parseTodoData(tool: ToolCallData): {
  groups: ParsedPhaseGroup[];
  totalDone: number;
  totalTasks: number;
  opBadge?: string;
} {
  const input = tool.input;
  const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, any>) : undefined;
  const output = tool.output || '';

  let opBadge: string | undefined;
  if (inputObj?.op === 'done' && inputObj.task) {
    opBadge = `Completed: ${inputObj.task}`;
  } else if (inputObj?.op === 'init') {
    opBadge = 'Initialized Todo List';
  }

  // 1. Try parsing structured output like:
  // Coverage:
  //   - [X] Add AskPanel renderer
  //   - [ ] Add ThinkPanel renderer (in progress)
  const lines = output.split(/\r?\n/);
  const groups: ParsedPhaseGroup[] = [];
  let currentGroup: ParsedPhaseGroup = { phase: 'Tasks', tasks: [] };

  let inChecklistSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Detect section start: "Active phase ...", "Coverage:", etc.
    if (trimmed.endsWith(':') && !trimmed.startsWith('Overall') && !trimmed.startsWith('Remaining')) {
      const phaseName = trimmed.replace(/:$/, '').trim();
      if (currentGroup.tasks.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = { phase: phaseName, tasks: [] };
      inChecklistSection = true;
      continue;
    }

    // Detect checklist items: - [X] or - [ ] or - [x]
    const checkMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (checkMatch) {
      const mark = checkMatch[1].toLowerCase();
      let text = checkMatch[2].trim();
      let status: 'done' | 'in_progress' | 'pending' = mark === 'x' ? 'done' : 'pending';

      if (text.includes('(in progress)') || text.includes('[in_progress]')) {
        status = 'in_progress';
        text = text.replace(/\(in progress\)/gi, '').replace(/\[in_progress\]/gi, '').trim();
      }

      currentGroup.tasks.push({ text, status, phase: currentGroup.phase });
      continue;
    }

    // Fallback: parse lines like "  - Add ThinkPanel renderer [in_progress] (Coverage)"
    const itemMatch = trimmed.match(/^-\s*(.+?)\s*\[(in_progress|pending|done)\](?:\s*\((.+?)\))?$/);
    if (itemMatch && !inChecklistSection) {
      const text = itemMatch[1].trim();
      const status = itemMatch[2] as 'done' | 'in_progress' | 'pending';
      const phase = itemMatch[3]?.trim() || 'Tasks';

      let targetGrp = groups.find((g) => g.phase === phase);
      if (!targetGrp) {
        targetGrp = { phase, tasks: [] };
        groups.push(targetGrp);
      }
      targetGrp.tasks.push({ text, status, phase });
    }
  }

  if (currentGroup.tasks.length > 0 && !groups.includes(currentGroup)) {
    groups.push(currentGroup);
  }

  // 2. If nothing parsed from output, check input.list
  if (groups.length === 0 && Array.isArray(inputObj?.list)) {
    for (const p of inputObj.list) {
      const phaseName = p.phase || 'Tasks';
      const tasks: ParsedTask[] = (p.items || []).map((it: string) => ({
        text: it,
        status: 'pending',
        phase: phaseName,
      }));
      groups.push({ phase: phaseName, tasks });
    }
  }

  // Calculate totals
  let totalTasks = 0;
  let totalDone = 0;
  for (const g of groups) {
    for (const t of g.tasks) {
      totalTasks++;
      if (t.status === 'done') totalDone++;
    }
  }

  // Check if output has "Overall: X/Y done"
  const overallMatch = output.match(/Overall:\s*(\d+)\/(\d+)\s*done/i);
  if (overallMatch) {
    totalDone = parseInt(overallMatch[1], 10);
    totalTasks = parseInt(overallMatch[2], 10);
  }

  return { groups, totalDone, totalTasks, opBadge };
}

/** Panel khusus untuk tool `todo` — task list dengan progress bar, phase groups, dan status yang readable. */
export function TodoPanel({ tool }: { tool: ToolCallData }) {
  const { groups, totalDone, totalTasks, opBadge } = useMemo(() => parseTodoData(tool), [tool]);

  if (groups.length === 0 && !opBadge) {
    const rawOutput = tool.output || '';
    return (
      <div className="rounded-lg border border-ink/8 bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink/80 whitespace-pre-wrap select-text">
        {rawOutput}
      </div>
    );
  }

  const pct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <div className="space-y-2">
      {/* Header with progress */}
      <div className="rounded-lg border border-ink/8 bg-paper p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListTodo size={13} className="text-ink/60" />
            <span className="text-[11px] font-semibold text-ink">Action Plan</span>
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
