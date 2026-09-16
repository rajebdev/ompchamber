import { useState, useMemo } from 'react';
import { Code2, Play, Check, Copy, AlertCircle, Clock, Ban } from 'lucide-react';
import type { ToolCallData } from '@/types';
import { copyToClipboard } from '@/hooks/ui/clipboard';
import { tryParseJson, highlightJson } from '@/lib/code/syntax-highlight';
import { truncateTailLines, MAX_OUTPUT_LINES } from '@/components/workspace/chat-timeline/tool-renderers/shared/truncate';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';

function highlightJs(code: string): string {
  if (!code) return '';
  try {
    return Prism.highlight(code, Prism.languages.javascript, 'javascript');
  } catch {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

/** Panel khusus untuk tool `eval` — eksekusi kode script, browser eval, dsb. */
export function Eval({ tool }: { tool: ToolCallData }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedOut, setCopiedOut] = useState(false);

  const input = tool.input;
  const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, any>) : undefined;

  const code =
    typeof inputObj?.code === 'string'
      ? inputObj.code
      : typeof input === 'string'
        ? input
        : '';

  const language = (typeof inputObj?.language === 'string' ? inputObj.language : 'js').toUpperCase();
  const timeout = typeof inputObj?.timeout === 'number' ? `${inputObj.timeout}s` : undefined;
  const title = typeof inputObj?.title === 'string' ? inputObj.title : undefined;

  const output = tool.output || (tool.error ? `Error: ${tool.error}` : '');
  const isError = tool.status === 'error' || output.includes('ToolError:') || output.includes('Command exited with code');
  const isAborted = output.includes('Command aborted') || tool.status === 'aborted';

  const jsonResult = useMemo(
    () => (!isError && !isAborted ? tryParseJson(output) : { isValid: false }),
    [output, isError, isAborted]
  );

  const truncatedCode = useMemo(() => truncateTailLines(code, MAX_OUTPUT_LINES), [code]);
  const highlightedCode = useMemo(() => highlightJs(truncatedCode.text), [truncatedCode]);
  const truncatedOutput = useMemo(() => truncateTailLines(output, MAX_OUTPUT_LINES), [output]);
  const truncatedJson = useMemo(
    () => (jsonResult.isValid && jsonResult.pretty ? truncateTailLines(jsonResult.pretty, MAX_OUTPUT_LINES) : null),
    [jsonResult]
  );
  const highlightedJson = useMemo(() => (truncatedJson ? highlightJson(truncatedJson.text) : ''), [truncatedJson]);

  const handleCopyCode = async () => {
    if (!code) return;
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyOut = async () => {
    const textToCopy = jsonResult.isValid && jsonResult.pretty ? jsonResult.pretty : output;
    if (!textToCopy) return;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setCopiedOut(true);
      setTimeout(() => setCopiedOut(false), 2000);
    }
  };

  return (
    <div className="space-y-2">
      {/* Code Card */}
      {code && (
        <div className="overflow-hidden rounded-lg border border-ink/8 bg-paper">
          <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/40 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Code2 size={12} className="text-ink/60" />
              <span className="font-mono text-[10.5px] font-semibold text-ink">
                {title || 'Script Evaluation'}
              </span>
              <span className="rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-ink/50">
                {language}
              </span>
              {timeout && (
                <span className="flex items-center gap-1 font-mono text-[9.5px] text-ink/40">
                  <Clock size={10} />
                  <span>{timeout}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {copiedCode ? <Check size={10} className="text-success" /> : <Copy size={10} />}
              {copiedCode ? 'Copied' : 'Copy'}
            </button>
          </div>

          {truncatedCode.skipped > 0 && (
            <div className="border-b border-ink/6 bg-canvas/40 px-3 py-1 font-mono text-[9.5px] text-ink/45">
              … {truncatedCode.skipped} earlier lines hidden
            </div>
          )}
          <div className="flex max-h-56 items-start overflow-x-auto font-mono text-[11px] leading-relaxed select-text">
            <div className="sticky left-0 flex-shrink-0 select-none border-r border-ink/6 bg-canvas/50 py-2.5 pl-2.5 pr-2 text-right text-[10px] text-ink/25">
              {truncatedCode.text.split('\n').map((_, idx) => (
                <div key={idx}>{idx + 1}</div>
              ))}
            </div>
            <pre
              className="flex-1 overflow-x-auto p-2.5 whitespace-pre text-ink/85 font-mono"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </div>
        </div>
      )}

      {/* Output / Result Block */}
      {output && (
        <div
          className={`overflow-hidden rounded-lg border ${
            isError
              ? 'border-error/25 bg-error/[0.03]'
              : isAborted
                ? 'border-warning/25 bg-warning/[0.03]'
                : 'border-ink/8 bg-paper'
          }`}
        >
          <div
            className={`flex items-center justify-between border-b px-3 py-1.5 ${
              isError
                ? 'border-error/15 bg-error/[0.06]'
                : isAborted
                  ? 'border-warning/15 bg-warning/[0.06]'
                  : 'border-ink/6 bg-canvas/30'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {isError ? (
                <>
                  <AlertCircle size={11} className="text-error" />
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-error">
                    Execution Error
                  </span>
                </>
              ) : isAborted ? (
                <>
                  <Ban size={11} className="text-warning" />
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-warning">
                    Evaluation Aborted
                  </span>
                </>
              ) : (
                <>
                  <Play size={11} className="text-success" />
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-ink/50">
                    Evaluation Result
                  </span>
                  {jsonResult.isValid && (
                    <>
                      <span className="rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-ink/50">
                        JSON
                      </span>
                      {jsonResult.linesCount && jsonResult.linesCount > 1 && (
                        <span className="font-mono text-[9.5px] text-ink/40">
                          {jsonResult.linesCount} lines
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleCopyOut}
              className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {copiedOut ? <Check size={10} className="text-success" /> : <Copy size={10} />}
              {copiedOut ? 'Copied' : 'Copy'}
            </button>
          </div>

          {jsonResult.isValid && jsonResult.pretty ? (
            <>
              {truncatedJson && truncatedJson.skipped > 0 && (
                <div className="border-b border-ink/6 bg-canvas/40 px-3 py-1 font-mono text-[9.5px] text-ink/45">
                  … {truncatedJson.skipped} earlier lines hidden
                </div>
              )}
              <div className="flex max-h-56 items-start overflow-x-auto font-mono text-[11px] leading-relaxed select-text">
                <div className="sticky left-0 flex-shrink-0 select-none border-r border-ink/6 bg-canvas/50 py-2 pl-2.5 pr-2 text-right text-[10px] text-ink/25">
                  {(truncatedJson ? truncatedJson.text : jsonResult.pretty).split('\n').map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <pre
                  className="flex-1 overflow-x-auto p-2.5 whitespace-pre text-ink/85 font-mono"
                  dangerouslySetInnerHTML={{ __html: highlightedJson }}
                />
              </div>
            </>
          ) : (
            <>
              {truncatedOutput.skipped > 0 && (
                <div className="border-b border-ink/6 bg-canvas/40 px-3 py-1 font-mono text-[9.5px] text-ink/45">
                  … {truncatedOutput.skipped} earlier lines hidden
                </div>
              )}
              <pre
                className={`max-h-48 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words select-text ${
                  isError ? 'text-error' : isAborted ? 'text-warning' : 'text-ink/80'
                }`}
              >
                {truncatedOutput.text}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
