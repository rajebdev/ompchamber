import React from 'react';
import { X, SlidersHorizontal, Check, ShieldCheck, Eye, Terminal, Sparkles, Cpu } from 'lucide-react';
import type { ProviderModel } from '@/types';

interface ModelCapabilitiesModalProps {
  isOpen: boolean;
  model: ProviderModel | null;
  onClose: () => void;
}

export function ModelCapabilitiesModal({
  isOpen,
  model,
  onClose,
}: ModelCapabilitiesModalProps) {
  if (!isOpen || !model) return null;

  const capabilities = [
    {
      title: 'Tool & Function Calling',
      desc: 'Allows autonomous agents to invoke CLI scripts, read files, and manipulate workspace files.',
      enabled: model.hasTools,
      icon: Terminal,
    },
    {
      title: 'Multimodal Vision',
      desc: 'Analyzes visual screenshots, terminal diffs, diagrams, and image uploads directly.',
      enabled: model.hasVision,
      icon: Eye,
    },
    {
      title: 'Extended Reasoning & Thinking Blocks',
      desc: 'Provides deep chain-of-thought scratchpad tokens before outputting code patches.',
      enabled: !!model.hasReasoning,
      icon: Cpu,
    },
    {
      title: 'Structured Output (JSON Schema)',
      desc: 'Forces strict conformance to specified JSON schemas for deterministic tool execution.',
      enabled: true,
      icon: ShieldCheck,
    },
    {
      title: 'Streaming Inference',
      desc: 'Delivers real-time incremental token chunks to the chat timeline with zero latency.',
      enabled: true,
      icon: Sparkles,
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-ink/15 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-ink/70" />
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Model Capabilities & Tools
              </h3>
              <p className="text-[11px] text-ink/50 truncate max-w-[280px]">
                {model.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-ink/40 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Capabilities list */}
        <div className="p-5 space-y-3">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.title}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-ink/5 border border-ink/10"
              >
                <div className="p-1.5 rounded bg-ink/10 text-ink mt-0.5">
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">{cap.title}</span>
                    {cap.enabled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 font-semibold uppercase tracking-wider">
                        <Check size={11} strokeWidth={2.5} />
                        Supported
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink/40 font-medium uppercase tracking-wider">
                        Not supported
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink/60 mt-0.5 leading-relaxed">
                    {cap.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-ink text-canvas text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
