import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { sanitizeHtml } from '@/lib/markdown/sanitize';
import { copyToClipboard } from '@/hooks/useClipboard';
import { detectOutputFormat } from '@/components/workspace/chat-timeline/tool-renderers/detect-format';
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

const escapeHtml = (unsafe: string): string =>
  unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const highlightCode = (code: string, language = 'javascript'): string => {
  if (!code) return '';
  try {
    const lang = Prism.languages[language] ? language : 'javascript';
    return Prism.highlight(code, Prism.languages[lang], lang);
  } catch {
    return escapeHtml(code);
  }
};

interface FallbackOutputProps {
  /** Teks output mentah dari tool result. */
  text: string;
}

/** Render output fallback generik dengan deteksi format otomatis:
 *  markdown → MarkdownRenderer; html → sanitize + inject; text → syntax highlight. */
export function FallbackOutput({ text }: FallbackOutputProps) {
  const [copied, setCopied] = useState(false);
  const format = useMemo(() => detectOutputFormat(text), [text]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  let body: React.ReactNode;
  if (format === 'markdown') {
    body = (
      <div className="prose-content max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink/85 select-text">
        <MarkdownRenderer content={text} />
      </div>
    );
  } else if (format === 'json') {
    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // fallback ke teks asli
    }
    body = (
      <pre
        className="max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/80 select-text"
        dangerouslySetInnerHTML={{ __html: highlightCode(pretty, 'json') }}
      />
    );
  } else if (format === 'html') {
    const sanitized = sanitizeHtml(text);
    body = (
      // DOMPurify sudah strip script/event handler di sanitize.ts
      <div
        className="max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink/85 select-text"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  } else {
    body = (
      <pre
        className="max-h-72 overflow-auto rounded-lg border border-ink/8 bg-paper px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/80 select-text"
        dangerouslySetInnerHTML={{ __html: highlightCode(text, 'javascript') }}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Output</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {body}
    </div>
  );
}
