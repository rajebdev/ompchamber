import { useState, useMemo } from 'react';
import { HelpCircle, CheckCircle2, ExternalLink, XCircle, Copy, Check } from 'lucide-react';
import type { ToolCallData } from '@/types';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { tryParseJson } from '@/lib/syntax-highlight';
import { JsonCodeBlock } from '@/components/workspace/chat-timeline/tool-renderers/JsonCodeBlock';
import { copyToClipboard } from '@/hooks/useClipboard';

interface OptionItem {
  label: string;
  description?: string;
}

/** Panel khusus untuk tool `ask` — dialog pertanyaan agent ke user atau konfirmasi. */
export function AskPanel({ tool }: { tool: ToolCallData }) {
  const input = tool.input;
  const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, any>) : undefined;

  // 1. Support omp questions array: input.questions[0]
  const questionEntry = Array.isArray(inputObj?.questions) && inputObj.questions.length > 0
    ? inputObj.questions[0]
    : undefined;

  const header = questionEntry?.header;

  const question =
    questionEntry?.question ||
    (typeof inputObj?.question === 'string'
      ? inputObj.question
      : typeof inputObj?.prompt === 'string'
        ? inputObj.prompt
        : typeof inputObj?.message === 'string'
          ? inputObj.message
          : typeof input === 'string'
            ? input
            : tool.detail || 'Question from agent');

  // Parse options: can be array of { label, description } or strings
  const rawOptions = questionEntry?.options || inputObj?.options || inputObj?.choices || [];
  const options: OptionItem[] = Array.isArray(rawOptions)
    ? rawOptions.map((opt: unknown) => {
        if (typeof opt === 'string') return { label: opt };
        if (typeof opt === 'object' && opt !== null) {
          const o = opt as Record<string, any>;
          return {
            label: typeof o.label === 'string' ? o.label : typeof o.text === 'string' ? o.text : String(opt),
            description: typeof o.description === 'string' ? o.description : undefined,
          };
        }
        return { label: String(opt) };
      })
    : [];

  const rawOutput = useMemo(() => {
    if (typeof tool.output === 'string') return tool.output;
    if (tool.output && typeof tool.output === 'object') return JSON.stringify(tool.output, null, 2);
    if (typeof inputObj?.answer === 'string') return inputObj.answer;
    if (inputObj?.answer && typeof inputObj?.answer === 'object') return JSON.stringify(inputObj.answer, null, 2);
    return '';
  }, [tool.output, inputObj?.answer]);

  const isCancelled = typeof rawOutput === 'string' && /cancelled|aborted|interrupted/i.test(rawOutput);

  // Extract selected answer if e.g. "User selected: Blue"
  const selectedMatch = typeof rawOutput === 'string' ? rawOutput.match(/selected:\s*(.+)$/i) : null;
  const selectedAnswer = selectedMatch ? selectedMatch[1].trim() : rawOutput;

  const jsonResult = useMemo(
    () => (!isCancelled && rawOutput ? tryParseJson(rawOutput) : { isValid: false }),
    [rawOutput, isCancelled]
  );

  const isMultilineText = typeof rawOutput === 'string' && rawOutput.includes('\n') && !selectedMatch;
  const [copiedText, setCopiedText] = useState(false);

  const handleCopyText = async () => {
    if (!rawOutput) return;
    const ok = await copyToClipboard(rawOutput);
    if (ok) {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const handleOpenDialog = () => {
    window.dispatchEvent(
      new CustomEvent('omp:open_ask_dialog', {
        detail: {
          type: 'extension_ui_request',
          id: tool.id || 'ask-interactive-preview',
          method: options.length > 0 ? 'select' : 'confirm',
          title: header || 'Confirmation Required',
          message: question,
          options: options.length > 0 ? options.map((o) => o.label) : undefined,
          optionDetails: options.map((o) => ({ description: o.description })),
        },
      })
    );
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-ink/10 bg-paper p-3 shadow-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <HelpCircle size={14} className="mt-0.5 shrink-0 text-ink/60" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/40">
                  {header ? `Agent Question · ${header}` : 'Agent Question'}
                </span>
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink/90 select-text">
                <MarkdownRenderer content={question} />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenDialog}
            title="Open interactive modal dialog"
            className="flex items-center gap-1 rounded-md border border-ink/10 bg-canvas/40 px-2 py-1 text-[10.5px] font-medium text-ink/60 transition-colors hover:border-ink/25 hover:bg-canvas hover:text-ink shrink-0"
          >
            <span>Open Modal</span>
            <ExternalLink size={10} className="opacity-70" />
          </button>
        </div>

        {options.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-ink/6 pt-2.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-ink/40">
              Options
            </span>
            <div className="grid gap-1.5">
              {options.map((opt, idx) => {
                const isSelected =
                  !isCancelled &&
                  Boolean(selectedAnswer) &&
                  selectedAnswer.toLowerCase().includes(opt.label.toLowerCase());

                return (
                  <div
                    key={idx}
                    className={`flex flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${
                      isSelected
                        ? 'border border-ink/30 bg-ink/5 font-medium text-ink'
                        : 'border border-ink/6 bg-canvas/30 text-ink/75'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-ink/5 font-mono text-[9px] text-ink/60 font-semibold">
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-ink/90">
                        {opt.label}
                      </span>
                      {isSelected && <CheckCircle2 size={12} className="shrink-0 text-success" />}
                    </div>
                    {opt.description && (
                      <div className="pl-5.5 text-[10px] leading-relaxed text-ink/50">
                        {opt.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* User Response Section — compact, proportional styling */}
      {isCancelled && rawOutput && (
        <div className="flex items-center gap-2 rounded-md border border-ink/8 bg-ink/[0.02] px-2.5 py-1 text-[10.5px] text-ink/60">
          <XCircle size={11} className="shrink-0 text-ink/40" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-ink/40 shrink-0">
            Status:
          </span>
          <span className="font-mono text-ink/60 truncate select-text">{rawOutput}</span>
        </div>
      )}

      {!isCancelled && jsonResult.isValid && jsonResult.pretty && (
        <JsonCodeBlock
          jsonString={jsonResult.pretty}
          title="User Response"
          maxHeightClass="max-h-40"
          compact={true}
          icon={<CheckCircle2 size={10.5} className="text-success shrink-0" />}
          showHeader={true}
        />
      )}

      {!isCancelled && !jsonResult.isValid && rawOutput && (
        isMultilineText ? (
          <div className="overflow-hidden rounded-md border border-ink/8 bg-paper">
            <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/40 px-2.5 py-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={10.5} className="shrink-0 text-success" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-ink/50">
                  User Response
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyText}
                className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink shrink-0"
                title="Copy response"
              >
                {copiedText ? <Check size={10} className="text-success" /> : <Copy size={10} />}
                {copiedText ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="max-h-32 overflow-y-auto p-2 font-mono text-[10.5px] leading-snug whitespace-pre-wrap break-words text-ink/85 select-text">
              {rawOutput}
            </pre>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-ink/8 bg-canvas/30 px-2.5 py-1 text-[10.5px]">
            <CheckCircle2 size={11} className="shrink-0 text-success" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-ink/40 shrink-0">
              User Response:
            </span>
            <span className="font-mono text-ink/90 font-medium truncate select-text">
              {selectedMatch ? selectedMatch[1].trim().replace(/^["']|["']$/g, '') : rawOutput}
            </span>
          </div>
        )
      )}
    </div>
  );
}

