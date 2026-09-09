import { useEffect, useState } from 'react';
import { FileText, Loader2, Check, Copy } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import 'prismjs/themes/prism.css';
import { copyToClipboard } from '@/hooks/useClipboard';

function getLanguage(filename?: string): string {
  if (!filename) return 'javascript';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'js': return 'javascript';
    case 'jsx': return 'jsx';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'css': return 'css';
    case 'sh':
    case 'bash': return 'bash';
    case 'html': return 'markup';
    default: return 'javascript';
  }
}

const escapeHtml = (unsafe: string): string =>
  unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const highlightCode = (code: string, language: string): string => {
  if (!code) return '';
  try {
    const lang = Prism.languages[language] ? language : 'javascript';
    return Prism.highlight(code, Prism.languages[lang], lang);
  } catch {
    return escapeHtml(code);
  }
};

interface ReadPanelProps {
  targetFilePath?: string;
  output: string;
}

/** File content + line numbers untuk tool read — lazy fetch saat expanded. */
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

  const content = output || lazyContent || '';

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (content) {
      const success = await copyToClipboard(content);
      if (success) {
        setCopiedOutput(true);
        setTimeout(() => setCopiedOutput(false), 2000);
      }
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          <FileText size={11} className="shrink-0" />
          <span className="truncate">{filePath || 'File Content'}</span>
        </div>
        {content && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {copiedOutput ? <Check size={10} className="text-success" /> : <Copy size={10} />}
            {copiedOutput ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {loadingFile ? (
        <div className="flex items-center gap-2 rounded-lg border border-ink/8 bg-paper px-3 py-3 font-mono text-[11px] text-ink/50">
          <Loader2 size={12} className="animate-spin" />
          <span>Loading file content...</span>
        </div>
      ) : content ? (
        <div className="flex max-h-80 items-start overflow-x-auto rounded-lg border border-ink/8 bg-paper font-mono text-[11px] leading-relaxed overscroll-contain scrollbar-overlay-container scrollbar-overlay-static select-text">
          <div className="sticky left-0 flex-shrink-0 select-none border-r border-ink/8 bg-canvas/60 py-2.5 pl-2.5 pr-2 text-right text-[10px] leading-relaxed text-ink/25">
            {content.split('\n').map((_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>
          <div
            className="flex-1 overflow-x-auto p-2.5 whitespace-pre text-ink/85"
            dangerouslySetInnerHTML={{ __html: highlightCode(content, getLanguage(filePath)) }}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-ink/15 px-3 py-3 font-mono text-[11px] text-ink/45">
          File is ready for inspection.
        </div>
      )}
    </div>
  );
}
