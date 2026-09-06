import React from 'react';
import { MessageSquare, Zap, Eye, Terminal } from 'lucide-react';
import type { SettingsState } from '@/types';

interface ChatSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function ChatSettings({ settings, onUpdate }: ChatSettingsProps) {
  return (
    <div className="space-y-8 text-xs text-[#141310]">
      {/* 1. Stream and Responsiveness */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-semibold text-[#141310]">Message Streaming & Rendering</h4>
          <MessageSquare size={14} className="text-[#141310]/50" />
        </div>

        <div className="space-y-3">
          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.streamResponses}
              onChange={(e) => onUpdate({ streamResponses: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Stream token responses in real-time</div>
              <div className="text-[11px] text-[#141310]/60">Show words as they generate instead of waiting for full generation.</div>
            </div>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.autoScrollChat}
              onChange={(e) => onUpdate({ autoScrollChat: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Auto-scroll to latest message</div>
              <div className="text-[11px] text-[#141310]/60">Automatically follow incoming tokens to the bottom of the timeline.</div>
            </div>
          </label>
        </div>
      </div>

      <div className="border-t border-[#141310]/10" />

      {/* 2. Reasoning & Thinking Blocks */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-semibold text-[#141310]">Reasoning & Monologue</h4>
          <Zap size={14} className="text-[#141310]/50" />
        </div>

        <div className="space-y-3">
          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.expandedThinking}
              onChange={(e) => onUpdate({ expandedThinking: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Keep thinking accordions expanded by default</div>
              <div className="text-[11px] text-[#141310]/60">Directly view internal agent thoughts and planning steps without clicking.</div>
            </div>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.detailedToolCalls}
              onChange={(e) => onUpdate({ detailedToolCalls: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Detailed tool call inputs & JSON payload inspect</div>
              <div className="text-[11px] text-[#141310]/60">Display comprehensive diffs and file arguments inside tool call badges.</div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
