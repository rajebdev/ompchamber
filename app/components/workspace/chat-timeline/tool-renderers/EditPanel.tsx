import { useState, useMemo } from 'react';
import { FileEdit, FilePlus, Check, Copy, ArrowRight, FileCode } from 'lucide-react';
import type { ToolCallData } from '@/types';
import { copyToClipboard } from '@/hooks/useClipboard';
import { DiffView } from '@/components/workspace/chat-timeline/tool-renderers/DiffView';
import { highlightCode, getLanguageFromPath, isCodeLike } from '@/lib/syntax-highlight';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Synthesize a standard unified diff from old_string and new_string */
function createUnifiedDiff(oldStr: string, newStr: string, filePath = 'diff'): string {
  const oldLines = oldStr ? oldStr.split(/\r?\n/) : [];
  const newLines = newStr ? newStr.split(/\r?\n/) : [];

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const contextBefore = oldLines.slice(Math.max(0, prefix - 2), prefix);
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const contextAfter = oldLines.slice(oldLines.length - suffix, oldLines.length - suffix + 2);

  const cleanPath = filePath || 'diff';
  const diffLines: string[] = [
    `--- a/${cleanPath}`,
    `+++ b/${cleanPath}`,
    `@@ -1,${oldLines.length || 1} +1,${newLines.length || 1} @@`,
  ];

  for (const line of contextBefore) {
    diffLines.push(` ${line}`);
  }
  for (const line of removed) {
    diffLines.push(`-${line}`);
  }
  for (const line of added) {
    diffLines.push(`+${line}`);
  }
  for (const line of contextAfter) {
    diffLines.push(` ${line}`);
  }

  return diffLines.join('\n');
}

/** Panel khusus untuk operasi edit file (write, edit, edit_file, create_file). */
export function EditPanel({ tool }: { tool: ToolCallData }) {
  const [copied, setCopied] = useState(false);
  const isWrite = tool.type === 'write' || tool.name === 'write' || tool.type === 'create_file';
  const input = tool.input;
  const inputObj = typeof input === 'object' && input !== null ? (input as Record<string, any>) : undefined;

  const targetPath =
    tool.target ||
    (inputObj?.path as string) ||
    (inputObj?.TargetFile as string) ||
    (inputObj?.targetFile as string) ||
    (inputObj?.FilePath as string) ||
    (inputObj?.filePath as string) ||
    (inputObj?.AbsolutePath as string) ||
    (inputObj?.absolutePath as string) ||
    (typeof input === 'string' && (input.includes('/') || input.includes('.')) ? input : undefined) ||
    '';

  const newContent =
    typeof inputObj?.content === 'string'
      ? inputObj.content
      : typeof inputObj?.Content === 'string'
        ? inputObj.Content
        : undefined;

  const oldString =
    typeof inputObj?.old_string === 'string'
      ? inputObj.old_string
      : typeof inputObj?.oldString === 'string'
        ? inputObj.oldString
        : typeof inputObj?.TargetContent === 'string'
          ? inputObj.TargetContent
          : typeof inputObj?.targetContent === 'string'
            ? inputObj.targetContent
            : undefined;

  const newString =
    typeof inputObj?.new_string === 'string'
      ? inputObj.new_string
      : typeof inputObj?.newString === 'string'
        ? inputObj.newString
        : typeof inputObj?.ReplacementContent === 'string'
          ? inputObj.ReplacementContent
          : typeof inputObj?.replacementContent === 'string'
            ? inputObj.replacementContent
            : undefined;

  const replacementChunks = Array.isArray(inputObj?.ReplacementChunks)
    ? (inputObj.ReplacementChunks as Array<{ TargetContent?: string; ReplacementContent?: string }>)
    : undefined;

  const explicitDiff =
    tool.diff?.diffText ||
    (typeof tool.details?.diff === 'string' ? tool.details.diff : undefined) ||
    (typeof tool.details?.patch === 'string' ? tool.details.patch : undefined);

  const diffText = useMemo(() => {
    if (explicitDiff) return explicitDiff;
    if (replacementChunks && replacementChunks.length > 0) {
      return replacementChunks
        .map((chunk) => createUnifiedDiff(chunk.TargetContent || '', chunk.ReplacementContent || '', targetPath))
        .join('\n');
    }
    if (oldString || newString) {
      return createUnifiedDiff(oldString || '', newString || '', targetPath);
    }
    return undefined;
  }, [explicitDiff, replacementChunks, oldString, newString, targetPath]);

  const output = tool.output || '';
  const lang = getLanguageFromPath(targetPath);

  const handleCopy = async () => {
    const textToCopy = newContent || newString || output;
    if (!textToCopy) return;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Target Path Bar */}
      <div className="flex items-center justify-between rounded-lg border border-ink/8 bg-paper px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink/5 text-ink/70">
            {isWrite ? <FilePlus size={12} /> : <FileEdit size={12} />}
          </span>
          <span className="truncate font-mono text-[11px] font-medium text-ink">
            {targetPath || 'File modification'}
          </span>
          <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/50">
            {isWrite ? 'Write' : 'Edit'}
          </span>
        </div>

        {(newContent || newString) && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {/* Unified Diff if available */}
      {diffText && (
        <div className="space-y-1">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Diff Changes</div>
          <DiffView text={diffText} />
        </div>
      )}

      {/* Replacement Diff (old_string vs new_string) */}
      {!diffText && (oldString || newString) && (
        <div className="space-y-1.5">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Replacement Changes</div>
          <div className="overflow-hidden rounded-lg border border-ink/8">
            {oldString && (
              <div className="border-b border-ink/6 bg-error/[0.04] p-2.5">
                <div className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-error">
                  <span>- Original Content</span>
                </div>
                <pre
                  className="max-h-40 overflow-x-auto font-mono text-[11px] leading-relaxed text-error/90 whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: highlightCode(oldString, lang) }}
                />
              </div>
            )}
            {newString && (
              <div className="bg-success/[0.04] p-2.5">
                <div className="mb-1 flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-success">
                  <span>+ Replaced With</span>
                </div>
                <pre
                  className="max-h-48 overflow-x-auto font-mono text-[11px] leading-relaxed text-success/90 whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: highlightCode(newString, lang) }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Written File Content Preview for write/create_file */}
      {!diffText && !oldString && !newString && newContent && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
            <span className="flex items-center gap-1">
              <FileCode size={11} />
              <span>Written File Preview</span>
            </span>
            <span className="font-mono text-[9px] text-ink/50">
              {newContent.split('\n').length} lines · {formatBytes(newContent.length)}
            </span>
          </div>
          <div className="flex max-h-64 items-start overflow-x-auto rounded-lg border border-ink/8 bg-paper font-mono text-[11px] leading-relaxed select-text">
            <div className="sticky left-0 flex-shrink-0 select-none border-r border-ink/8 bg-canvas/60 py-2.5 pl-2.5 pr-2 text-right text-[10px] leading-relaxed text-ink/25">
              {newContent.split('\n').slice(0, 80).map((_, idx) => (
                <div key={idx}>{idx + 1}</div>
              ))}
              {newContent.split('\n').length > 80 && <div>...</div>}
            </div>
            <div
              className="flex-1 overflow-x-auto p-2.5 whitespace-pre text-ink/85"
              dangerouslySetInnerHTML={{
                __html: highlightCode(newContent.split('\n').slice(0, 80).join('\n'), lang),
              }}
            />
          </div>
        </div>
      )}

      {/* Execution Result Notification */}
      {output && (
        <div className="rounded-lg border border-ink/8 bg-paper p-2.5 text-[11px] font-mono select-text">
          <div className="flex items-center gap-1.5 mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink/40">
            <ArrowRight size={11} className="text-success" />
            <span>Execution Output</span>
          </div>
          {isCodeLike(output) ? (
            <pre
              className="max-h-56 overflow-auto rounded bg-canvas/40 p-2 text-ink/85 whitespace-pre leading-relaxed scrollbar-overlay-container scrollbar-overlay-static"
              dangerouslySetInnerHTML={{
                __html: highlightCode(output, lang),
              }}
            />
          ) : (
            <div className="text-ink/75 leading-relaxed whitespace-pre-wrap">{output}</div>
          )}
        </div>
      )}
    </div>
  );
}
