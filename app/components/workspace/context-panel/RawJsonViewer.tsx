import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface RawJsonViewerProps {
  data: Record<string, any>;
}

export function RawJsonViewer({ data }: RawJsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Syntax highlighting parser
  const renderHighlightedJson = (text: string) => {
    const lines = text.split('\n');

    return (
      <div className="table w-full border-collapse">
        {lines.map((line, idx) => {
          // Highlight matching JSON tokens
          const formatted = line.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
            (match) => {
              let cls = 'text-amber-500 dark:text-amber-400'; // number default
              if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                  cls = 'text-sky-600 dark:text-sky-300 font-medium'; // key
                } else {
                  cls = 'text-emerald-600 dark:text-emerald-400'; // string value
                }
              } else if (/true|false/.test(match)) {
                cls = 'text-purple-600 dark:text-purple-400 font-medium'; // boolean
              } else if (/null/.test(match)) {
                cls = 'text-rose-500 dark:text-rose-400'; // null
              }
              return `<span class="${cls}">${match}</span>`;
            }
          );

          return (
            <div key={idx} className="table-row leading-5 hover:bg-ink/[0.03]">
              {/* Line Number Gutter */}
              <span className="table-cell pr-3 select-none text-right text-ink/30 font-mono text-[10px] w-6 align-top">
                {idx + 1}
              </span>
              {/* Code Line Content */}
              <span
                className="table-cell whitespace-pre font-mono text-[11px] text-ink/90 align-top"
                dangerouslySetInnerHTML={{ __html: formatted }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative group/code my-1.5 rounded-lg bg-paper/80 border border-ink/10 p-2.5 font-mono overflow-x-auto selection:bg-ink selection:text-canvas">
      {/* Action Header Overlay */}
      <div className="absolute top-2 right-2 flex items-center space-x-1 z-10 opacity-0 group-hover/code:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-1 rounded bg-canvas hover:bg-paper text-ink/70 hover:text-ink border border-ink/10 text-[10px] transition-colors shadow-xs"
          title="Copy Pretty JSON"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-600" />
              <span className="text-emerald-600 font-sans font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span className="font-sans">Copy JSON</span>
            </>
          )}
        </button>
      </div>

      <div className="pr-4">
        {renderHighlightedJson(jsonString)}
      </div>
    </div>
  );
}
