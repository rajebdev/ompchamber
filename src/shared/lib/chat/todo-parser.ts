import type { ToolCallData } from '@/shared/types';

export interface ParsedTask {
  text: string;
  status: 'done' | 'in_progress' | 'pending';
  phase?: string;
}

export interface ParsedPhaseGroup {
  phase: string;
  tasks: ParsedTask[];
}

export interface TodoDataSummary {
  groups: ParsedPhaseGroup[];
  totalDone: number;
  totalInProgress: number;
  totalPending: number;
  totalTasks: number;
  opBadge?: string;
  summaryText: string;
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
      // Use the larger group as the base list order
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

export function parseTodoData(tool: ToolCallData): TodoDataSummary {
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

  // If nothing parsed from output, check input.list
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

  // Merge & deduplicate all phase groups
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

  // Calculate totals across parsed tasks
  let totalDone = 0;
  let totalInProgress = 0;
  let totalPending = 0;

  for (const g of groups) {
    for (const t of g.tasks) {
      if (t.status === 'done') totalDone++;
      else if (t.status === 'in_progress') totalInProgress++;
      else totalPending++;
    }
  }

  let totalTasks = totalDone + totalInProgress + totalPending;

  // Check if output has explicit overall count
  const overallMatch = output.match(/Overall:\s*(\d+)\/(\d+)\s*done/i)
    || output.match(/(\d+)\s+of\s+(\d+)\s+completed/i);
  if (overallMatch) {
    const parsedDone = parseInt(overallMatch[1], 10);
    const parsedTotal = parseInt(overallMatch[2], 10);
    if (parsedTotal >= totalTasks) {
      totalDone = parsedDone;
      totalTasks = parsedTotal;
      totalPending = Math.max(0, totalTasks - totalDone - totalInProgress);
    }
  }

  const summaryParts: string[] = [];
  if (totalDone > 0) summaryParts.push(`${totalDone} complete`);
  if (totalInProgress > 0) summaryParts.push(`${totalInProgress} in progress`);
  if (totalPending > 0) summaryParts.push(`${totalPending} pending`);
  const summaryText = summaryParts.length > 0 ? summaryParts.join(' · ') : (totalTasks > 0 ? `${totalTasks} items` : '');

  return {
    groups,
    totalDone,
    totalInProgress,
    totalPending,
    totalTasks,
    opBadge,
    summaryText,
  };
}

export function getTodoSummary(tool: ToolCallData): string | undefined {
  const summary = parseTodoData(tool);
  if (summary.totalTasks > 0 || summary.groups.length > 0) {
    return summary.summaryText;
  }
  return undefined;
}
