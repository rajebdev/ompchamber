import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Copy, Check, BrainCircuit } from 'lucide-react';
import type { ThinkingData } from '@/types';
import { copyToClipboard } from '@/hooks/useClipboard';

interface ThinkingSectionProps {
  thinking: ThinkingData | string;
  defaultExpanded?: boolean;
}

export function ThinkingSection({ thinking, defaultExpanded = false }: ThinkingSectionProps) {
  const isGenerating = typeof thinking === 'object' ? Boolean(thinking.isGenerating) : false;
  const [isOpen, setIsOpen] = useState(defaultExpanded || isGenerating);
  const [copied, setCopied] = useState(false);
  const thoughtBodyRef = React.useRef<HTMLDivElement>(null);

  // Auto-expand if thinking starts generating
  React.useEffect(() => {
    if (isGenerating) {
      setIsOpen(true);
    }
  }, [isGenerating]);

  const thoughtText = typeof thinking === 'string' ? thinking : thinking.thought || '';
  // omp wraps injected system prompts in <system-notice> tags; models often
  // echo that wrapper verbatim into their reasoning stream. Lift the notice
  // out as its own alert and keep only the actual reasoning in the drawer.
  const noticeMatch = thoughtText.match(/<system-notice[^>]*>([\s\S]*?)<\/system-notice>/);
  const noticeText = noticeMatch?.[1]?.trim() ?? '';
  const cleanThought = thoughtText.replace(/<system-notice[^>]*>[\s\S]*?<\/system-notice>/g, '').trim();
  const duration = typeof thinking === 'object' ? thinking.duration : undefined;
  const summary = typeof thinking === 'object' && thinking.summary 
    ? thinking.summary 
    : cleanThought.slice(0, 100) + (cleanThought.length > 100 ? '...' : '');

  // Keep the reasoning body pinned to its newest content while open: streaming
  // grows the text above the fold, so follow it unless the user scrolls up.
  React.useEffect(() => {
    if (!isOpen || !isGenerating) return;
    const el = thoughtBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isOpen, cleanThought, isGenerating]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(cleanThought);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleOpen = () => {
    setIsOpen(prev => !prev);
  };

  if (!cleanThought) return null;

  return (
    <div className="w-full font-sans">
      {/* Header Button */}
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-ink/5 rounded-md transition-colors cursor-pointer select-none text-[12px]"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-2 min-w-0 pr-[50px] flex-1">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-ink/5 text-ink/70 flex-shrink-0">
            <Sparkles size={12} />
          </div>
          <span className="font-semibold text-ink tracking-tight text-[12px]">Thinking</span>
          {duration && (
            <span className="text-[10px] font-mono text-ink/50 bg-ink/5 px-1.5 py-0.5 rounded flex-shrink-0">
              {duration}
            </span>
          )}
          {!isOpen && summary && (
            <span className="text-ink/55 font-mono text-[11px] truncate min-w-0 flex-1">
              {summary}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
          <span className="text-[10px] font-mono text-ink/50 hidden sm:inline">
            {isOpen ? 'Collapse' : 'Expand'}
          </span>
          {isOpen ? (
            <ChevronDown size={14} className="text-ink/60" />
          ) : (
            <ChevronRight size={14} className="text-ink/60" />
          )}
        </div>
      </button>

      {/* Expanded Content Drawer */}
      {isOpen && (
        <div className="mt-2 mx-3 px-3.5 py-2.5 bg-ink/5 rounded-md text-[12px] text-ink/80 leading-relaxed font-sans space-y-2">
          <div className="flex items-center justify-between pb-1 text-[11px] font-mono text-ink/60 border-b border-ink/5">
            <span>Model Reasoning & Strategy</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center space-x-1 hover:text-ink transition-colors px-1.5 py-0.5 rounded hover:bg-ink/5 active:scale-95 cursor-pointer"
              title="Copy thinking"
            >
              {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
              <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {noticeText && (
            <div className="flex items-start space-x-2.5 rounded-md border border-ink/15 bg-paper/80 px-3 py-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="w-6 h-6 rounded-full bg-ink/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <BrainCircuit size={13} className="text-ink/70" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-ink/50 font-semibold mb-0.5">
                  System Notice
                </div>
                <div className="text-[12px] text-ink/85 leading-relaxed">
                  {noticeText}
                </div>
              </div>
            </div>
          )}

          <div
            ref={thoughtBodyRef}
            className="border-l-2 border-ink/20 pl-3 py-1 text-[12px] text-ink/85 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-72 scrollbar-overlay-container scrollbar-overlay-static select-text"
          >
            {cleanThought}
          </div>
        </div>
      )}
    </div>
  );
}
