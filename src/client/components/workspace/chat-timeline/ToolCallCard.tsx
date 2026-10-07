/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One tool call in the timeline: the header shell plus, when expanded, either
 * the family's own panel or the generic Input / Diff / Output body.
 *
 * Everything that decides what the card SAYS lives outside this file and is
 * pure — `toolCardHeader`/`toolCardSubtitle` (naming), `toolSummary` (the
 * outcome chips), `toolPanelKind` (which panel), `card-helpers` (glyphs). This
 * file is the wiring, which is what keeps it inside the repo's size ceiling.
 */

import { useCallback, useMemo } from 'preact/hooks';
import { memo } from 'preact/compat';
import { Bell } from 'lucide-preact';
import type { ToolCallData } from '@/shared/types';
import { stripAnsiCodes } from '@/shared/lib/code/ansi';
import { isReminderTag, unwrapXmlEnvelopes } from '@/shared/lib/chat/xml-envelope';
import { CopyButton } from '@/client/components/common/CopyButton';
import { ToolCardShell } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/ToolCardShell';
import { ArtifactChip } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/ArtifactChip';
import { DiffView } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/DiffView';
import { FallbackOutput } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/FallbackOutput';
import { JsonCodeBlock } from '@/client/components/workspace/chat-timeline/tool-renderers/shared/JsonCodeBlock';
import { ToolDetailsPanel, resolveToolKey } from '@/client/components/workspace/chat-timeline/tool-renderers';
import { toolPanelKind } from '@/client/components/workspace/chat-timeline/tool-renderers/registry';
import { toolSummary, type ToolFact } from '@/shared/lib/chat/tool/summary';
import { tryParseJson } from '@/shared/lib/code/syntax-highlight';
import {
  commandOrInputOf,
  diffTextOf,
  evalLanguageIcon,
  toolIcon,
} from '@/client/components/workspace/chat-timeline/tool-renderers/shared/card-helpers';
import {
  toolCardHeader,
  toolCardSubtitle,
} from '@/client/components/workspace/chat-timeline/tool-renderers/shared/card-header';

interface ToolCallCardProps {
  tool: ToolCallData;
  isOpen?: boolean;
  onToggle?: (toolId: string) => void;
  defaultExpanded?: boolean;
}

/** Intent is capped for the chip row; a longer line lives in its tooltip. */
const INTENT_CHIP_MAX = 60;

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
      {children}
    </div>
  );
}

export const ToolCallCard = memo(function ToolCallCard({ tool, isOpen, onToggle, defaultExpanded = false }: ToolCallCardProps) {
  const toolKey = resolveToolKey(tool);
  // A pure classification, not a probe render: the old `hasToolDetailsPanel`
  // built the panel's VNode and threw it away, once per card per streaming
  // frame. `toolPanelKind` is a lookup, so this is free.
  const hasPanel = useMemo(() => toolPanelKind(tool) !== null, [tool]);
  const summary = useMemo(() => toolSummary(tool), [tool]);
  const header = useMemo(() => toolCardHeader(tool, toolKey), [tool, toolKey]);
  const subtitle = toolCardSubtitle(tool, header);

  const commandOrInput = commandOrInputOf(tool);
  const outputText = tool.output || (tool.error ? `Error: ${tool.error}` : '');
  const diffText = diffTextOf(tool);

  const handleToggle = useCallback(() => {
    onToggle?.(tool.id);
  }, [onToggle, tool.id]);

  const inputJson = useMemo(
    () => (!hasPanel && commandOrInput ? tryParseJson(commandOrInput) : null),
    [hasPanel, commandOrInput]
  );

  // A reminder envelope in the result is the runtime interrupting the call, not
  // its outcome — the header flags it beside the status badge.
  const isReminder = useMemo(
    () => unwrapXmlEnvelopes(stripAnsiCodes(outputText)).some((envelope) => isReminderTag(envelope.tag)),
    [outputText],
  );

  // The model's own one-liner (omp's `i` field, present on 82% of calls) is the
  // most readable thing a collapsed card can say, and it used to be shown for
  // MCP calls only. It becomes the first chip rather than the subtitle, so the
  // precise path the subtitle carries is not traded away for it.
  const headerSummary = useMemo(() => {
    const intent = tool.intent?.trim();
    if (!intent) return summary;
    const fact: ToolFact = {
      kind: 'subject',
      label: intent.length > INTENT_CHIP_MAX ? `${intent.slice(0, INTENT_CHIP_MAX - 1)}…` : intent,
      title: intent,
    };
    return summary
      ? { facts: [fact, ...summary.facts], line: `${fact.label} · ${summary.line}` }
      : { facts: [fact], line: fact.label };
  }, [tool.intent, summary]);

  const actions = (
    <>
      <ArtifactChip tool={tool} />
      {isReminder && (
        <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
          <Bell size={10} /> Reminder
        </span>
      )}
    </>
  );

  // The eval card is marked by the language it runs, not a generic code glyph.
  const icon = tool.icon || (toolKey === 'eval' ? evalLanguageIcon(tool) : null) || toolIcon(toolKey);

  return (
    <ToolCardShell
      tool={tool}
      icon={icon}
      title={header.title}
      subtitle={subtitle}
      summary={headerSummary}
      actions={actions}
      isOpen={isOpen}
      onToggle={onToggle ? handleToggle : undefined}
      defaultExpanded={defaultExpanded}
      alwaysExpanded={hasPanel && (toolKey === 'yield' || toolKey === 'goal' || toolKey === 'ask')}
    >
      <ToolDetailsPanel tool={tool} />

      {!hasPanel && commandOrInput && (
        <div className="space-y-1.5 code-surface">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <SectionLabel>Input</SectionLabel>
              {inputJson?.isValid && (
                <span className="rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-ink/45">
                  JSON
                </span>
              )}
            </div>
            <CopyButton
              text={inputJson?.isValid && inputJson.pretty ? inputJson.pretty : commandOrInput}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
              onClick={(e) => e.stopPropagation()}
              label="Copy"
            />
          </div>
          {inputJson?.isValid && inputJson.pretty ? (
            <JsonCodeBlock
              jsonString={inputJson.pretty}
              maxHeightClass="max-h-60"
              showHeader={false}
            />
          ) : (
            <pre className="overflow-x-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-ink/80 select-text">
              {commandOrInput}
            </pre>
          )}
        </div>
      )}

      {!hasPanel && diffText && (
        <div className="space-y-1.5">
          <SectionLabel>Diff</SectionLabel>
          <DiffView text={diffText} path={subtitle} />
        </div>
      )}

      {!hasPanel && outputText && (
        <FallbackOutput text={outputText} />
      )}
    </ToolCardShell>
  );
});
