import { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { providerLabel } from '@/lib/models/provider-label';

interface GeneratingIndicatorProps {
  modelName?: string;
  generatingVerb?: string;
  provider?: string;
  providerNames?: Record<string, string>;
}

const COOL_VERBS = [
  'Synthesizing solution',
  'Evaluating context',
  'Reading workspace',
  'Planning next step',
  'Executing diagnostics',
  'Compiling edge routes'
];

export function GeneratingIndicator({ modelName, generatingVerb, provider, providerNames }: GeneratingIndicatorProps) {
  const [activeVerbIndex, setActiveVerbIndex] = useState(0);

  // Rotate action verb every 2.8s
  useEffect(() => {
    if (generatingVerb) return;
    const interval = setInterval(() => {
      setActiveVerbIndex((prev) => (prev + 1) % COOL_VERBS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [generatingVerb]);

  const displayVerb = generatingVerb 
    ? (generatingVerb.charAt(0).toUpperCase() + generatingVerb.slice(1))
    : COOL_VERBS[activeVerbIndex];

  const providerText = provider ? providerLabel(provider, providerNames) : '';

  return (
    <div 
      id="generating-docked-indicator"
      className="w-full flex items-center px-1 py-1 bg-transparent border-0 border-none text-[11px] font-mono select-none animate-in fade-in duration-200"
    >
      <style>{`
        @keyframes bounce-dot {
          0%, 100% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-15%); }
        }
        .dot-anim-1 { animation: bounce-dot 1.2s infinite both; }
        .dot-anim-2 { animation: bounce-dot 1.2s infinite both 0.2s; }
        .dot-anim-3 { animation: bounce-dot 1.2s infinite both 0.4s; }
      `}</style>

      {/* Left info: Animated Rainbow Spinner Ring + Bot Badge + Model Name + Dynamic Action Verb */}
      <div className="flex items-center space-x-2 min-w-0">
        
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
          <div className="relative w-full h-full rounded-[3px] bg-ink flex items-center justify-center text-canvas z-10 shadow-2xs">
            <Bot size={10} className="text-canvas" />
          </div>
        </div>

        {/* Provider & model name with dynamic verb + dots */}
        <div className="flex items-center space-x-1.5 min-w-0 truncate">
          {providerText && (
            <span className="text-ink/55 truncate shrink">{providerText}</span>
          )}
          <span className="font-semibold text-ink truncate">
            {modelName}
          </span>
          <span className="text-ink/40 shrink-0">•</span>
          <span className="text-ink/75 flex items-center space-x-1 shrink-0 font-medium">
            <span className="transition-all duration-300">{displayVerb}</span>
            <span className="inline-flex tracking-wider text-ink/80 ml-0.5">
              <span className="dot-anim-1 inline-block">.</span>
              <span className="dot-anim-2 inline-block">.</span>
              <span className="dot-anim-3 inline-block">.</span>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
