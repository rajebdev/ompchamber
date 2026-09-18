import { useState } from 'preact/hooks';
import { BrainCircuit, Check, Copy } from 'lucide-preact';
import type { ToolCallData } from '@/shared/types';
import { copyToClipboard } from '@/client/hooks/ui/clipboard';
import { MarkdownRenderer } from '@/client/components/common/MarkdownRenderer';

/** Panel khusus untuk tool `think` — internal monologue & reasoning scratchpad. */
export function Think({ tool }: { tool: ToolCallData }) {
  const [copied, setCopied] = useState(false);

  const input = tool.input;
  const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, any>) : undefined;

  const thoughtText =
    typeof inputObj?.thought === 'string'
      ? inputObj.thought
      : typeof inputObj?.reasoning === 'string'
        ? inputObj.reasoning
        : typeof inputObj?.notes === 'string'
          ? inputObj.notes
          : typeof input === 'string'
            ? input
            : tool.output || tool.detail || '';

  const handleCopy = async () => {
    if (!thoughtText) return;
    const ok = await copyToClipboard(thoughtText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!thoughtText) {
    return (
      <div className="rounded-lg border border-dashed border-ink/15 p-3 font-mono text-[11px] text-ink/40">
        No thought details recorded.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/8 bg-paper">
      <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/40 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <BrainCircuit size={12} className="text-ink/50" />
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
            Internal Reasoning
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto p-3 text-[11.5px] leading-relaxed text-ink/80 select-text">
        <MarkdownRenderer content={thoughtText} />
      </div>
    </div>
  );
}
