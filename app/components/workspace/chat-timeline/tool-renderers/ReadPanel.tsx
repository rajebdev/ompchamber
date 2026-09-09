import { useEffect, useState, useMemo } from 'react';
import { FileText, Folder, FolderOpen, Loader2, Check, Copy, Info, FileCode } from 'lucide-react';
import { copyToClipboard } from '@/hooks/useClipboard';
import { highlightCode, getLanguageFromPath } from '@/lib/syntax-highlight';
import { parseDirListing, parseNumberedCode } from '@/lib/code-parser';

interface ReadPanelProps {
  targetFilePath?: string;
  output: string;
}

/** File & Directory content viewer untuk tool `read` / `view_file` / `read_file`. */
export function ReadPanel({ targetFilePath, output }: ReadPanelProps) {
  const [lazyContent, setLazyContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const filePath = targetFilePath || '';

  useEffect(() => {
    if (filePath && !output && lazyContent === null && !loadingFile) {
      setLoadingFile(true);
      fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`)
        .then((res) => res.json())
        .then((data) => {
          setLazyContent(data && data.content !== undefined ? data.content : `// Loaded file: ${filePath}`);
        })
        .catch(() => {
          setLazyContent(`// Loaded file: ${filePath}`);
        })
        .finally(() => {
          setLoadingFile(false);
        });
    }
  }, [filePath, output, lazyContent, loadingFile]);

  const rawContent = output || lazyContent || '';
  const dirInfo = useMemo(() => parseDirListing(rawContent), [rawContent]);

  // Check for elision notices like "[…120ln elided; ...]" or "[Showing lines X-Y of Z...]"
  const { displayContent, elisionNotices } = useMemo(() => {
    if (dirInfo.isDirectory) return { displayContent: rawContent, elisionNotices: [] };
    const lines = rawContent.split(/\r?\n/);
    const notices: string[] = [];
    const codeLines: string[] = [];

    for (const l of lines) {
      const trimmed = l.trim();
      if (
        (trimmed.startsWith('[…') || trimmed.startsWith('[Showing lines ') || trimmed.startsWith('[1 results limit')) &&
        trimmed.endsWith(']')
      ) {
        notices.push(trimmed.slice(1, -1));
      } else {
        codeLines.push(l);
      }
    }

    return { displayContent: codeLines.join('\n'), elisionNotices: notices };
  }, [rawContent, dirInfo.isDirectory]);

  const parsedCode = useMemo(() => {
    if (dirInfo.isDirectory || !displayContent) {
      return { lines: [], cleanCode: '', hasLineNumbers: false };
    }
    return parseNumberedCode(displayContent);
  }, [displayContent, dirInfo.isDirectory]);

  const isDir = dirInfo.isDirectory;
  const lang = getLanguageFromPath(filePath);

  const highlightedCode = useMemo(() => {
    if (!parsedCode.cleanCode) return '';
    return highlightCode(parsedCode.cleanCode, lang);
  }, [parsedCode.cleanCode, lang]);

  const handleCopy = async () => {
    const textToCopy = parsedCode.hasLineNumbers ? parsedCode.cleanCode : (rawContent || '');
    if (!textToCopy) return;
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  return (
    <div className="space-y-2">
      {/* Header Info */}
      <div className="flex items-center justify-between rounded-lg border border-ink/8 bg-paper px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink/5 text-ink/70">
            {isDir ? <FolderOpen size={12} /> : <FileCode size={12} />}
          </span>
          <span className="truncate font-mono text-[11px] font-medium text-ink">
            {filePath || (isDir ? 'Directory Listing' : 'File Content')}
          </span>
          <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink/50">
            {isDir ? 'Directory' : lang}
          </span>
        </div>

        {rawContent && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {copiedOutput ? <Check size={11} className="text-success" /> : <Copy size={11} />}
            {copiedOutput ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {loadingFile ? (
        <div className="flex items-center gap-2 rounded-lg border border-ink/8 bg-paper px-3 py-3 font-mono text-[11px] text-ink/50">
          <Loader2 size={12} className="animate-spin" />
          <span>Loading file content...</span>
        </div>
      ) : isDir ? (
        /* Render Directory Listing */
        <div className="overflow-hidden rounded-lg border border-ink/8 bg-paper">
          <div className="max-h-72 divide-y divide-ink/[0.04] overflow-y-auto font-mono text-[11px]">
            {dirInfo.entries.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-ink/[0.02]"
                style={{ paddingLeft: `${Math.max(12, (entry.indent + 1) * 16)}px` }}
              >
                {entry.isDir ? (
                  <Folder size={12} className="shrink-0 text-ink/60" />
                ) : (
                  <FileText size={12} className="shrink-0 text-ink/40" />
                )}
                <span
                  className={`min-w-0 flex-1 truncate ${
                    entry.isDir ? 'font-semibold text-ink' : 'text-ink/80'
                  }`}
                >
                  {entry.name}
                  {entry.isDir && '/'}
                </span>
                {entry.size && <span className="shrink-0 font-mono text-[9.5px] text-ink/40">{entry.size}</span>}
                {entry.time && (
                  <span className="shrink-0 rounded bg-ink/5 px-1 py-0.2 font-mono text-[9px] text-ink/45">
                    {entry.time}
                  </span>
                )}
              </div>
            ))}
          </div>
          {dirInfo.notice && (
            <div className="flex items-center gap-1.5 border-t border-ink/8 bg-canvas/60 px-3 py-1.5 text-[10px] text-ink/50">
              <Info size={11} className="shrink-0" />
              <span>{dirInfo.notice}</span>
            </div>
          )}
        </div>
      ) : rawContent ? (
        /* Render Code Content with synchronized, straight line numbers and clean code */
        <div className="space-y-1.5">
          <div className="relative flex max-h-80 items-start overflow-auto rounded-lg border border-ink/8 bg-paper font-mono text-[11px] leading-[20px] select-text overscroll-contain">
            {/* Gutter: Line numbers */}
            <div
              className="sticky left-0 z-10 flex-shrink-0 select-none border-r border-ink/8 bg-canvas/90 py-2.5 pl-3 pr-2.5 text-right font-mono text-[11px] leading-[20px] tabular-nums text-ink/35 backdrop-blur-xs"
              aria-hidden="true"
            >
              {parsedCode.lines.map((line, idx) => (
                <div key={idx} className="h-[20px] leading-[20px]">
                  {line.lineNum}
                </div>
              ))}
            </div>

            {/* Code Body */}
            <pre
              className="m-0 flex-1 min-w-max overflow-visible py-2.5 pl-3 pr-4 font-mono text-[11px] leading-[20px] whitespace-pre text-ink/85 focus:outline-none"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </div>

          {/* Elision information banner */}
          {elisionNotices.map((notice, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 bg-canvas/50 px-3 py-1.5 font-mono text-[10.5px] text-ink/55"
            >
              <Info size={12} className="shrink-0 text-ink/40" />
              <span>{notice}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-ink/15 px-3 py-3 font-mono text-[11px] text-ink/45">
          File is ready for inspection.
        </div>
      )}
    </div>
  );
}
