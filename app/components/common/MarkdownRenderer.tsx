import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '@/hooks/useClipboard';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeBlock({ language, code }: { language?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-[#141310]/15 bg-[#f4f1ea] overflow-hidden font-mono text-[12px] shadow-2xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#eae6dc] border-b border-[#141310]/10 text-[11px] text-[#141310]/70 select-none">
        <span className="font-semibold text-[#141310] tracking-wider uppercase text-[10px]">
          {language || 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#141310]/10 text-[#141310]/70 hover:text-[#141310] transition-colors cursor-pointer text-[10px]"
          title="Copy code"
        >
          {copied ? <Check size={11} className="text-emerald-700" /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[#141310] leading-relaxed select-text font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div className={`prose-container text-[13px] text-[#141310] leading-relaxed select-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom Code and Code Block renderer
          code({ className: codeClass, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClass || '');
            const rawString = String(children).replace(/\n$/, '');
            const isMultiLine = rawString.includes('\n') || Boolean(match);

            if (isMultiLine) {
              return <CodeBlock language={match?.[1]} code={rawString} />;
            }

            return (
              <code
                className="px-1.5 py-0.5 rounded bg-[#141310]/5 border border-[#141310]/10 font-mono text-[12px] text-[#141310] break-words"
                {...props}
              >
                {children}
              </code>
            );
          },
          // Custom Paragraph renderer
          p({ children }) {
            return <p className="mb-2 last:mb-0 leading-relaxed break-words">{children}</p>;
          },
          // Custom Headings renderer
          h1({ children }) {
            return <h1 className="text-[16px] font-bold text-[#141310] mt-3.5 mb-1.5 font-sans tracking-tight">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-[15px] font-bold text-[#141310] mt-3 mb-1 font-sans tracking-tight">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-[14px] font-semibold text-[#141310] mt-2.5 mb-1 font-sans">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="text-[13px] font-semibold text-[#141310] mt-2 mb-0.5 font-sans">{children}</h4>;
          },
          // Custom List renderers
          ul({ children }) {
            return <ul className="list-disc pl-5 my-1.5 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-1.5 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          // Custom Blockquote renderer
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-[#141310]/30 pl-3 my-2 text-[#141310]/80 italic bg-[#141310]/2 py-1 rounded-r">
                {children}
              </blockquote>
            );
          },
          // Custom Table renderer
          table({ children }) {
            return (
              <div className="my-2.5 overflow-x-auto rounded-lg border border-[#141310]/15">
                <table className="w-full text-left text-[12px] border-collapse bg-[#faf8f3]">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-[#f2efe9] border-b border-[#141310]/15 text-[#141310] font-semibold">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-[#141310]/10">{children}</tbody>;
          },
          th({ children }) {
            return <th className="px-3 py-1.5 font-semibold text-[#141310]">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-1.5 text-[#141310]/90">{children}</td>;
          },
          // Custom Links renderer
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 decoration-[#141310]/40 text-[#141310] font-medium hover:decoration-[#141310] transition-colors"
              >
                {children}
              </a>
            );
          },
          // Custom Horizontal Rule
          hr() {
            return <hr className="my-3 border-t border-[#141310]/15" />;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
