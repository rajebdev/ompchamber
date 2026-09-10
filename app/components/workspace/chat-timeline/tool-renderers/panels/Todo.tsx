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

function cleanPhaseName(raw: string): string {
  let name = raw.replace(/:$/, '').trim();
  // Strip "Active phase 1/1" or "Active phase" or "Phase 1:" prefix
  name = name.replace(/^active\s+phase(?:\s+\d+\/\d+)?(?:\s*[:\-]\s*|\s+)?/i, '');
  // Strip quotes around phase name: "Coverage" -> Coverage
  name = name.replace(/^["']|["']$/g, '');
  // Strip trailing parentheticals like (0/4 done) or (4 tasks) or (Coverage)
  name = name.replace(/\s*\(\d+(?:\/\d+)?\s*(?:done|remaining|tasks)?\)$/i, '');
  // If wrapped in parentheses like (Coverage)
  name = name.replace(/^\((.+)\)$/, '$1');
  return name.trim() || 'Tasks';
}

function mergePhaseGroups(rawGroups: ParsedPhaseGroup[]): ParsedPhaseGroup[] {
  const map = new Map<string, ParsedPhaseGroup>();

  for (const g of rawGroups) {
    if (!g.tasks.length) continue;
    const phaseName = cleanPhaseName(g.phase);
    const key = phaseName.toLowerCase();

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { phase: phaseName, tasks: [...g.tasks] });
    } else {
      // Use the larger group as the base list order (it's the complete checklist)
      const baseTasks = g.tasks.length >= existing.tasks.length ? g.tasks : existing.tasks;
      const otherTasks = baseTasks === g.tasks ? existing.tasks : g.tasks;

      const taskMap = new Map<string, ParsedTask>();
      for (const t of baseTasks) {
        taskMap.set(t.text.toLowerCase().trim(), { ...t, phase: phaseName });
      }
      for (const t of otherTasks) {
        const tKey = t.text.toLowerCase().trim();
        const prev = taskMap.get(tKey);
        if (!prev) {
          taskMap.set(tKey, { ...t, phase: phaseName });
        } else {
          // Status priority: done > in_progress > pending
          if (t.status === 'done') {
            prev.status = 'done';
          } else if (t.status === 'in_progress' && prev.status !== 'done') {
            prev.status = 'in_progress';
          }
        }
      }

      existing.phase = phaseName;
      existing.tasks = Array.from(taskMap.values());
    }
  }

  // Cross-group subset elimination:
  // If Group A's tasks are entirely contained in Group B (e.g. active sub-list vs full phase list),
  // merge any status from Group A into Group B and drop Group A.
  const groupsList = Array.from(map.values());
  const result: ParsedPhaseGroup[] = [];

  for (let i = 0; i < groupsList.length; i++) {
    const gA = groupsList[i];
    const aTexts = gA.tasks.map((t) => t.text.toLowerCase().trim());

    let isSubset = false;
    for (let j = 0; j < groupsList.length; j++) {
      if (i === j) continue;
      const gB = groupsList[j];
      const bTexts = new Set(gB.tasks.map((t) => t.text.toLowerCase().trim()));

      if (gB.tasks.length >= gA.tasks.length && aTexts.every((txt) => bTexts.has(txt))) {
        for (const tA of gA.tasks) {
          const tB = gB.tasks.find((t) => t.text.toLowerCase().trim() === tA.text.toLowerCase().trim());
          if (tB) {
            if (tA.status === 'done') tB.status = 'done';
            else if (tA.status === 'in_progress' && tB.status !== 'done') tB.status = 'in_progress';
          }
        }
        isSubset = true;
        break;
      }
    }

    if (!isSubset) {
      result.push(gA);
    }
  }

  return result;
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

  const lines = output.split(/\r?\n/);
  const rawGroups: ParsedPhaseGroup[] = [];
  let currentGroup: ParsedPhaseGroup = { phase: 'Tasks', tasks: [] };

  let inChecklistSection = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Detect section start: "Active phase ...", "Coverage:", etc.
    if (trimmed.endsWith(':') && !trimmed.startsWith('Overall') && !trimmed.startsWith('Remaining')) {
      const phaseName = cleanPhaseName(trimmed);
      if (currentGroup.tasks.length > 0) {
        rawGroups.push(currentGroup);
      }
      currentGroup = { phase: phaseName, tasks: [] };
      inChecklistSection = true;
      continue;
    }

    // Detect checklist items: - [X] or [X] or - [ ] or [ ] or * [X]
    const checkMatch = trimmed.match(/^(?:[-*]\s*)?\[([ xX])\]\s*(.+)$/);
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

    // Fallback: parse lines like "  - Add Think renderer [in_progress] (Coverage)"
    const itemMatch = trimmed.match(/^-\s*(.+?)\s*\[(in_progress|pending|done)\](?:\s*\((.+?)\))?$/);
    if (itemMatch && !inChecklistSection) {
      const text = itemMatch[1].trim();
      const status = itemMatch[2] as 'done' | 'in_progress' | 'pending';
      const phase = cleanPhaseName(itemMatch[3]?.trim() || 'Tasks');

      let targetGrp = rawGroups.find((g) => cleanPhaseName(g.phase).toLowerCase() === phase.toLowerCase());
      if (!targetGrp) {
        targetGrp = { phase, tasks: [] };
        rawGroups.push(targetGrp);
      }
      targetGrp.tasks.push({ text, status, phase });
    }
  }

  if (currentGroup.tasks.length > 0 && !rawGroups.includes(currentGroup)) {
    rawGroups.push(currentGroup);
  }

  // 2. If nothing parsed from output, check input.list
  if (rawGroups.length === 0 && Array.isArray(inputObj?.list)) {
    for (const p of inputObj.list) {
      const phaseName = cleanPhaseName(p.phase || 'Tasks');
      const tasks: ParsedTask[] = (p.items || []).map((it: string) => ({
        text: it,
        status: 'pending',
        phase: phaseName,
      }));
      rawGroups.push({ phase: phaseName, tasks });
    }
  }

  // Merge & deduplicate all phase groups (consolidates duplicate headers, subsets, and active phase boxes)
  const groups = mergePhaseGroups(rawGroups);

  // If tool was an op: 'done', ensure the task is marked as done
  if (inputObj?.op === 'done' && inputObj.task) {
    const doneText = String(inputObj.task).toLowerCase().trim();
    for (const g of groups) {
      const target = g.tasks.find((t) => t.text.toLowerCase().trim() === doneText);
      if (target) {
        target.status = 'done';
      }
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

  // Check if output has "Overall: X/Y done" or "X of Y completed"
  const overallMatch = output.match(/Overall:\s*(\d+)\/(\d+)\s*done/i)
    || output.match(/(\d+)\s+of\s+(\d+)\s+completed/i);
  if (overallMatch) {
    const parsedDone = parseInt(overallMatch[1], 10);
    const parsedTotal = parseInt(overallMatch[2], 10);
    if (parsedTotal >= totalTasks) {
      totalDone = parsedDone;
      totalTasks = parsedTotal;
    }
  }

  return { groups, totalDone, totalTasks, opBadge };
}

/** Panel khusus untuk tool `todo` — task list dengan progress bar, phase groups, dan status yang readable. */
export function Todo({ tool }: { tool: ToolCallData }) {
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
