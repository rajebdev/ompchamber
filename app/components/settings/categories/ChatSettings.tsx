import React from 'react';
import type { SettingsState } from '@/types';

interface ChatSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function ChatSettings({ settings, onUpdate }: ChatSettingsProps) {
  return (
    <div className="space-y-6 text-xs text-[#141310]">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[#141310]">Follow up behavior</h4>
        <div className="flex flex-col space-y-2">
          <label className="flex items-center space-x-3 cursor-pointer select-none">
            <input
              type="radio"
              name="followUpBehavior"
              value="queue"
              checked={settings.followUpBehavior === 'queue'}
              onChange={() => onUpdate({ followUpBehavior: 'queue' })}
              className="w-4 h-4 text-[#141310] border-[#141310]/30 focus:ring-0 accent-[#141310]"
            />
            <span className="font-semibold text-xs text-[#141310]">Queue (Send chat input as queue)</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer select-none">
            <input
              type="radio"
              name="followUpBehavior"
              value="steering"
              checked={settings.followUpBehavior === 'steering'}
              onChange={() => onUpdate({ followUpBehavior: 'steering' })}
              className="w-4 h-4 text-[#141310] border-[#141310]/30 focus:ring-0 accent-[#141310]"
            />
            <span className="font-semibold text-xs text-[#141310]">Steering (Send chat input as steering)</span>
          </label>
        </div>
      </div>
    </div>
  );
}
