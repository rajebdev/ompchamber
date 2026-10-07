/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The fact chips a collapsed tool card shows.
 *
 * `toolSummary` decides WHAT is worth saying (pure, tested in `shared/lib`);
 * this module decides how it looks. Splitting them keeps the presentation table
 * in one place — an icon per fact kind and a tone per tone — so a `bash` exit
 * code and an `edit` diagnostic count read as the same family of statement
 * instead of each panel inventing its own.
 *
 * Nothing here truncates silently: a chip whose label is elided carries the
 * full text in `title`, because the header clips the row on a narrow panel and
 * a clipped fact with no tooltip is a fact the reader cannot recover.
 */

import type { ReactNode } from 'preact/compat';
import {
  AlertTriangle,
  Clock,
  FileDiff,
  HardDrive,
  Hash,
  Info,
  ListTodo,
  Quote,
  Rows,
} from 'lucide-preact';
import type { ToolFact } from '@/shared/lib/chat/tool/summary';

const ICON_BY_KIND: Record<ToolFact['kind'], ReactNode> = {
  exit: <Hash size={10} />,
  time: <Clock size={10} />,
  size: <HardDrive size={10} />,
  range: <Rows size={10} />,
  count: <Hash size={10} />,
  diff: <FileDiff size={10} />,
  progress: <ListTodo size={10} />,
  subject: <Quote size={10} />,
  warn: <AlertTriangle size={10} />,
  note: <Info size={10} />,
};

/** Chip tone → class list. `muted` is the default and needs no entry. */
const TONE_CLASSES: Record<NonNullable<ToolFact['tone']> & ('ok' | 'warn' | 'error'), string> = {
  ok: 'bg-success/10 text-success',
  warn: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
};

/** A fact that is a verdict reads as a badge; a fact that is a measurement does
 *  not — an `exit 0` and a `+4 −1` are not the same claim. */
const BADGE_KINDS: ReadonlySet<ToolFact['kind']> = new Set(['exit', 'diff', 'progress', 'warn']);

function chipClass(fact: ToolFact): string {
  const base = 'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9.5px]';
  if (fact.tone && fact.tone !== 'muted') return `${base} font-semibold ${TONE_CLASSES[fact.tone]}`;
  if (BADGE_KINDS.has(fact.kind)) return `${base} bg-ink/5 text-ink/60`;
  return `${base} text-ink/45`;
}

/** The chips for one tool call's facts, in the order `toolSummary` produced. */
export function ToolFactChips({ facts, max = 4 }: { facts: ToolFact[]; max?: number }) {
  if (facts.length === 0) return null;
  const shown = facts.slice(0, max);
  const overflow = facts.length - shown.length;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {shown.map((fact, index) => (
        <span key={`${fact.kind}-${index}`} className={chipClass(fact)} title={fact.title ?? fact.label}>
          <span className="text-ink/40" aria-hidden="true">
            {ICON_BY_KIND[fact.kind]}
          </span>
          <span className="truncate">{fact.label}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="shrink-0 font-mono text-[9.5px] text-ink/35">+{overflow}</span>
      )}
    </span>
  );
}
