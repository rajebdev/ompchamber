import { useState, useMemo } from 'react';
import { Info, ChevronDown, Bot, CheckCircle2, Clock } from 'lucide-react';
import { highlightCode, isCodeLike } from '@/lib/code/syntax-highlight';

interface SystemNoticeProps {
  notice: string;
}

interface ParsedTaskResult {
  id?: string;
  agent?: string;
  status?: string;
  duration?: string;
  body: string;
}

function parseTaskResultXml(text: string): ParsedTaskResult | null {
  const match = text.match(/<task-result\b([^>]*)>([\s\S]*?)<\/task-result>/i);
  if (!match) return null;
  const attrs = match[1];
  const body = match[2].trim();
  const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
  const agent = attrs.match(/\bagent=["']([^"']+)["']/i)?.[1];
  const status = attrs.match(/\bstatus=["']([^"']+)["']/i)?.[1];
  const duration = attrs.match(/\bduration=["']([^"']+)["']/i)?.[1];
  return { id, agent, status, duration, body };
}

/** System notice collapsible — baris 1 judul, sisanya hasil scrollable dengan syntax highlighting. */
export function SystemNotice({ notice }: SystemNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);

  const lines = notice.split(/\r?\n/);
  const firstLine = (lines.find((l) => l.trim()) ?? '').trim();
  const restStart = lines.findIndex((l) => l.trim() === firstLine);
  const rest = lines.slice(restStart + 1).join('\n').trim();

  const taskResult = useMemo(() => (rest ? parseTaskResultXml(rest) : null), [rest]);
  const isCode = useMemo(() => isCodeLike(rest), [rest]);

  return (
    <div className="mx-3 overflow-hidden rounded-xl border border-ink/10 bg-paper text-[12px] text-ink transition-colors hover:border-ink/20 select-text">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.03]"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10">
          <Info size={13} className="text-ink/70" />
        </span>
        <span className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink/50">
              System Notice
            </span>
            {taskResult?.agent && (
              <span className="flex items-center gap-1 rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] text-ink/60">
                <Bot size={10} />
                {taskResult.agent}
              </span>
            )}
            {taskResult?.duration && (
              <span className="flex items-center gap-1 font-mono text-[9px] text-ink/40">
                <Clock size={9} />
                {taskResult.duration}
              </span>
            )}
          </div>
          <span className="block truncate text-[12px] font-medium text-ink">
            {firstLine || notice}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink/35 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && rest && (
        <div className="border-t border-ink/8 bg-canvas/40 px-3.5 py-2.5">
          {taskResult ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-ink/60">
                <span className="flex items-center gap-1.5 font-semibold text-ink/80">
                  <CheckCircle2 size={11} className="text-success" />
                  Task Result: {taskResult.id || taskResult.agent || 'Subagent'}
                </span>
                {taskResult.status && (
                  <span className="rounded bg-success/10 px-1.5 py-0.2 text-[9px] font-semibold text-success uppercase">
                    {taskResult.status}
                  </span>
                )}
              </div>
              <pre
                className="max-h-56 overflow-auto rounded-md border border-ink/6 bg-paper p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/80 scrollbar-overlay-container scrollbar-overlay-static"
                dangerouslySetInnerHTML={{
                  __html: isCodeLike(taskResult.body)
                    ? highlightCode(taskResult.body, 'javascript')
                    : taskResult.body
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;'),
                }}
              />
            </div>
          ) : (
            <pre
              className="max-h-56 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/75 scrollbar-overlay-container scrollbar-overlay-static"
              dangerouslySetInnerHTML={{
                __html: isCode
                  ? highlightCode(rest, 'javascript')
                  : rest
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;'),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
