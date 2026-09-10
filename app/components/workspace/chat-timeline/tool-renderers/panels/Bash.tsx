import { useState, useMemo } from 'react';
import { Check, Copy, Clock } from 'lucide-react';
import type { ToolCallData } from '@/types';
import { copyToClipboard } from '@/hooks/ui/clipboard';
import { highlightCode, isCodeLike, tryParseJson } from '@/lib/code/syntax-highlight';
import { JsonCodeBlock } from '@/components/workspace/chat-timeline/tool-renderers/shared/JsonCodeBlock';

interface BashMeta {
  exitCode?: unknown;
  cwd?: unknown;
  durationMs?: unknown;
  truncated?: unknown;
}

function parseWallTime(text: string): { cleanText: string; wallTime?: string } {
  const match = text.match(/\n*Wall time:\s*([^\n\r]+)$/);
  if (match) {
    return {
      cleanText: text.replace(/\n*Wall time:\s*[^\n\r]+$/, '').trim(),
      wallTime: match[1].trim(),
    };
  }
  return { cleanText: text.trim() };
}

/** Panel untuk tool `bash` / `terminal` — terminal styled console dengan log highlighting & stats. */
export function Bash({ tool }: { tool: ToolCallData }) {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedOut, setCopiedOut] = useState(false);

  const details = tool.details ?? {};
  const meta = details as BashMeta;
  const inputObj = typeof tool.input === 'object' && tool.input !== null ? (tool.input as Record<string, any>) : undefined;
  const command =
    tool.command ||
    (typeof inputObj?.command === 'string' ? inputObj.command : undefined) ||
    (typeof inputObj?.cmd === 'string' ? inputObj.cmd : undefined) ||
    (typeof inputObj?.CommandLine === 'string' ? inputObj.CommandLine : undefined) ||
    (typeof inputObj?.commandLine === 'string' ? inputObj.commandLine : undefined) ||
    (typeof tool.input === 'string' ? tool.input : '');
  const rawOutput = tool.output || (tool.error ? `Error: ${tool.error}` : '');

  const { cleanText: output, wallTime } = parseWallTime(rawOutput);

  const exitCode = typeof meta.exitCode === 'number' ? meta.exitCode : tool.isError ? 1 : undefined;
  const cwd =
    (typeof meta.cwd === 'string' ? meta.cwd : undefined) ||
    (typeof inputObj?.cwd === 'string' ? inputObj.cwd : undefined) ||
    (typeof inputObj?.Cwd === 'string' ? inputObj.Cwd : undefined);
  const durationMs = typeof meta.durationMs === 'number' ? meta.durationMs : tool.durationMs;
  const duration = tool.duration || wallTime || (durationMs ? `${durationMs}ms` : undefined);

  const isSilent = !output || output === '(no output)';

  const jsonResult = useMemo(
    () => (!isSilent && !tool.isError ? tryParseJson(output) : { isValid: false }),
    [output, isSilent, tool.isError]
  );

  const handleCopyCmd = async () => {
    if (!command) return;
    const ok = await copyToClipboard(command);
    if (ok) {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
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
      {/* Terminal Command Window */}
      {command && (
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-paper">
          <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/60 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-ink/20" />
                <span className="h-2 w-2 rounded-full bg-ink/20" />
                <span className="h-2 w-2 rounded-full bg-ink/20" />
              </div>
              <span className="font-mono text-[10px] font-semibold text-ink/50">bash</span>
              {cwd && (
                <span className="truncate font-mono text-[9.5px] text-ink/40" title={cwd}>
                  {cwd}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {exitCode !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.2 font-mono text-[9px] font-semibold ${
                    exitCode === 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                  }`}
                >
                  exit {exitCode}
                </span>
              )}
              {duration && (
                <span className="flex items-center gap-1 font-mono text-[9.5px] text-ink/45">
                  <Clock size={10} />
                  <span>{duration}</span>
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyCmd}
                className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
                title="Copy command"
              >
                {copiedCmd ? <Check size={10} className="text-success" /> : <Copy size={10} />}
                {copiedCmd ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 px-3 py-2 font-mono text-[11.5px] leading-relaxed">
            <span className="select-none font-bold text-ink/40">$</span>
            <pre
              className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-ink/90 select-text"
              dangerouslySetInnerHTML={{ __html: highlightCode(command, 'bash') }}
            />
          </div>
        </div>
      )}

      {/* Output Console */}
      {isSilent ? (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-ink/15 bg-canvas/30 px-3 py-2 font-mono text-[11px] text-ink/50">
          <div className="flex items-center gap-2">
            <Check size={12} className="text-success" />
            <span>Command executed successfully with no output</span>
          </div>
          {duration && <span className="text-[10px] text-ink/40">Wall time: {duration}</span>}
        </div>
      ) : jsonResult.isValid && jsonResult.pretty ? (
        <div className="overflow-hidden rounded-lg border border-ink/8 bg-paper">
          <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/30 px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Console Output</span>
              <span className="rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-ink/50">JSON</span>
              {jsonResult.linesCount && jsonResult.linesCount > 1 && (
                <span className="font-mono text-[9.5px] text-ink/40">{jsonResult.linesCount} lines</span>
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
          <JsonCodeBlock
            jsonString={jsonResult.pretty}
            maxHeightClass="max-h-72"
            showHeader={false}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink/8 bg-paper">
          <div className="flex items-center justify-between border-b border-ink/6 bg-canvas/30 px-3 py-1.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Console Output</span>
            <button
              type="button"
              onClick={handleCopyOut}
              className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {copiedOut ? <Check size={10} className="text-success" /> : <Copy size={10} />}
              {copiedOut ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain p-3 font-mono text-[11px] leading-relaxed select-text">
            {isCodeLike(output) ? (
              <pre
                className="overflow-x-auto whitespace-pre text-ink/85 leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: highlightCode(
                    output,
                    output.trim().startsWith('{') || output.trim().startsWith('[') ? 'json' : 'javascript',
                  ),
                }}
              />
            ) : (
              output.split('\n').map((line, idx) => {
                const isSuccessLine = line.includes('✓') || line.includes('built in') || line.includes('ready: 0 errors');
                const isErrorLine = line.includes('Error:') || line.includes('error:') || line.includes('FAILED');
                const isWarningLine = line.includes('warning:') || line.includes('warn:');

                return (
                  <div
                    key={idx}
                    className={`whitespace-pre-wrap break-words ${
                      isSuccessLine
                        ? 'text-success font-medium'
                        : isErrorLine
                          ? 'text-error font-medium'
                          : isWarningLine
                            ? 'text-warning font-medium'
                            : 'text-ink/80'
                    }`}
                  >
                    {line || '\u00a0'}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
