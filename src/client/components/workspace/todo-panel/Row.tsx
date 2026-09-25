/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One task row of the todo panel.
 *
 * The five statuses render through one component because they are one axis of
 * the same row — icon, tone, and whether the text is struck through — and
 * splitting them across branches is how a `blocked` task ends up drawn as an
 * ordinary pending one. A blocked task also carries its own note (`blocker`),
 * which is the only place omp records WHY it is waiting.
 */

import { Ban, CheckCircle2, Circle, Loader2, OctagonAlert } from 'lucide-preact';
import type { TodoItem } from '@/shared/types/todo';
import { taskNote, todoStatusVisual } from '@/shared/lib/chat/todo/progress';

function StatusIcon({ status, className }: { status: TodoItem['status']; className: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={13} className={className} />;
    case 'in_progress':
      return <Loader2 size={13} className={`${className} animate-spin`} />;
    case 'abandoned':
      return <Ban size={13} className={className} />;
    case 'blocked':
      return <OctagonAlert size={13} className={className} />;
    default:
      return <Circle size={13} className={className} />;
  }
}

export function TodoRow({ task, current }: { task: TodoItem; current: boolean }) {
  const visual = todoStatusVisual(task.status);
  const note = taskNote(task);

  return (
    <div
      className={`flex items-start gap-2.5 px-2.5 py-1.5 transition-colors ${
        current ? 'bg-ink/[0.04]' : ''
      }`}
    >
      <StatusIcon status={task.status} className={`mt-[2px] shrink-0 ${visual.tone}`} />
      <div className="min-w-0 flex-1">
        <div
          className={`text-[11.5px] leading-snug ${
            visual.closed
              ? 'text-ink/40 line-through'
              : visual.active
                ? 'font-medium text-ink'
                : 'text-ink/75'
          }`}
        >
          {task.content}
        </div>
        {note && (
          <div className="mt-0.5 text-[10.5px] leading-snug text-warning/90 break-words">{note}</div>
        )}
      </div>
      {visual.active && (
        <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/70">
          Now
        </span>
      )}
    </div>
  );
}
