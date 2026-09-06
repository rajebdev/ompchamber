import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import type { ThinkingData } from '@/types';
import { copyToClipboard } from '@/hooks/useClipboard';

interface ThinkingSectionProps {
  thinking: ThinkingData | string;
  defaultExpanded?: boolean;
}

export function ThinkingSection({ thinking, defaultExpanded = false }: ThinkingSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const thoughtText = typeof thinking === 'string' ? thinking : thinking.thought || '';
  const duration = typeof thinking === 'object' ? thinking.duration : undefined;
  const summary = typeof thinking === 'object' && thinking.summary 
    ? thinking.summary 
    : thoughtText.slice(0, 100) + (thoughtText.length > 100 ? '...' : '');

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(thoughtText);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleOpen = () => {
    setIsOpen(prev => !prev);
  };

  if (!thoughtText.trim()) return null;

  return (
    <div className="w-full my-2 font-sans border border-[#141310]/15 rounded-lg bg-[#faf8f3] overflow-hidden transition-all duration-200">
      {/* Header Button */}
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#141310]/5 transition-colors cursor-pointer select-none text-[12px]"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-2 min-w-0 pr-2 flex-1">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-[#141310]/5 text-[#141310]/70 flex-shrink-0">
            <Sparkles size={12} />
          </div>
          <span className="font-semibold text-[#141310] tracking-tight text-[12px]">Thinking</span>
          {duration && (
            <span className="text-[10px] font-mono text-[#141310]/50 bg-[#141310]/5 px-1.5 py-0.5 rounded flex-shrink-0">
              {duration}
            </span>
          )}
          {!isOpen && summary && (
            <span className="text-[11px] text-[#141310]/60 italic truncate max-w-[180px] sm:max-w-[340px]">
              — {summary}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
          <span className="text-[10px] font-mono text-[#141310]/50 hidden sm:inline">
            {isOpen ? 'Collapse' : 'Expand'}
          </span>
          {isOpen ? (
            <ChevronDown size={14} className="text-[#141310]/60" />
          ) : (
            <ChevronRight size={14} className="text-[#141310]/60" />
          )}
        </div>
      </button>

      {/* Expanded Content Drawer */}
      {isOpen && (
        <div className="px-3.5 py-2.5 border-t border-[#141310]/10 bg-[#f7f5ee]/50 text-[12px] text-[#141310]/80 leading-relaxed font-sans space-y-2">
          <div className="flex items-center justify-between pb-1 text-[11px] font-mono text-[#141310]/60 border-b border-[#141310]/5">
            <span>Model Reasoning & Strategy</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center space-x-1 hover:text-[#141310] transition-colors px-1.5 py-0.5 rounded hover:bg-[#141310]/5 active:scale-95 cursor-pointer"
              title="Copy thinking"
            >
              {copied ? <Check size={11} className="text-emerald-700" /> : <Copy size={11} />}
              <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="border-l-2 border-[#141310]/20 pl-3 py-1 text-[12px] text-[#141310]/85 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-72 overflow-y-auto select-text">
            {thoughtText}
          </div>
        </div>
      )}
    </div>
  );
}
