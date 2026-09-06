import React, { useState, useEffect } from 'react';
import { Bot, Sparkles } from 'lucide-react';

interface GeneratingIndicatorProps {
  modelName?: string;
  generatingVerb?: string;
}

const COOL_VERBS = [
  'Synthesizing',
  'Reasoning',
  'Architecting',
  'Deconstructing',
  'Compiling',
  'Analyzing context',
  'Optimizing',
  'Formulating solution'
];

export function GeneratingIndicator({ modelName, generatingVerb }: GeneratingIndicatorProps) {
  const currentModel = modelName || 'DeepSeek V4 Pro';
  
  const [activeVerbIndex, setActiveVerbIndex] = useState(0);

  // Cycle through cool action verbs every 2.4s if no static verb is locked
  useEffect(() => {
    if (generatingVerb) return;
    const interval = setInterval(() => {
      setActiveVerbIndex((prev) => (prev + 1) % COOL_VERBS.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [generatingVerb]);

  const displayVerb = generatingVerb 
    ? (generatingVerb.charAt(0).toUpperCase() + generatingVerb.slice(1))
    : COOL_VERBS[activeVerbIndex];

  return (
    <div className="flex flex-col items-start space-y-2 w-full max-w-full font-sans animate-in fade-in duration-200">
      <style>{`
        @keyframes bounce-dot {
          0%, 100% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-15%); }
        }
        .dot-anim { animation: bounce-dot 1.2s infinite both; }
        .dot-anim:nth-child(2) { animation-delay: 0.2s; }
        .dot-anim:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      {/* Bottom Metadata Toolbar (standardized with ChatMessageItem footer: text-[11px] font-mono) */}
      <div className="w-full flex items-center flex-nowrap space-x-2.5 text-[11px] text-[#141310]/60 px-1 pt-0.5 font-mono min-w-0">
        <div className="flex items-center space-x-1.5 border-r border-[#141310]/15 pr-2.5 min-w-0 shrink overflow-hidden">
          
          {/* Bot Icon with Animated Colorful Gradient Spinner */}
          <div className="relative w-4 h-4 rounded flex items-center justify-center shrink-0">
            {/* Multi-color conic gradient spinner ring */}
            <div 
              className="absolute -inset-[1.5px] rounded-[5px] animate-spin"
              style={{
                background: 'conic-gradient(from 0deg, #ff453a, #ff9f0a, #ffd60a, #30d158, #64d2ff, #0a84ff, #bf5af2, #ff375f, #ff453a)',
                animationDuration: '1.2s'
              }}
            />
            {/* Center Dark Bot Badge */}
            <div className="relative w-full h-full rounded-[3px] bg-[#141310] flex items-center justify-center text-[#f4f1ea] z-10 shadow-2xs">
              <Bot size={10} className="text-[#f4f1ea]" />
            </div>
          </div>

          {/* Model Name */}
          <span className="font-semibold text-[#141310] truncate">
            {currentModel}
          </span>
          <span className="text-[#141310]/40 shrink-0">•</span>

          {/* Dynamic Cool Action Verb + Animated Dots */}
          <span className="text-[#141310]/75 shrink-0 flex items-center space-x-1 font-medium">
            <span className="transition-all duration-300">{displayVerb}</span>
            <span className="inline-flex tracking-wider text-[#141310]/80">
              <span className="dot-anim inline-block">.</span>
              <span className="dot-anim inline-block">.</span>
              <span className="dot-anim inline-block">.</span>
            </span>
          </span>
        </div>

        {/* Live status telemetry badge */}
        <span className="text-[#141310]/50 text-[10px] font-mono italic truncate hidden sm:inline">
          active cycle
        </span>
      </div>
    </div>
  );
}


