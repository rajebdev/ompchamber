import React from 'react';
import type { SettingsState } from '@/types';

interface ChatSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

type KeybindingOption = 'Enter' | 'Shift + Enter' | 'Ctrl / Cmd + Enter';

export function ChatSettings({ settings, onUpdate }: ChatSettingsProps) {
  const options: KeybindingOption[] = ['Enter', 'Shift + Enter', 'Ctrl / Cmd + Enter'];

  const handleKeybindingChange = (action: 'keybindingSend' | 'keybindingNewLine' | 'keybindingSteering', newValue: KeybindingOption) => {
    onUpdate(prev => {
      const updates: Partial<SettingsState> = { [action]: newValue };
      
      const otherActions: ('keybindingSend' | 'keybindingNewLine' | 'keybindingSteering')[] = [
        'keybindingSend',
        'keybindingNewLine',
        'keybindingSteering'
      ].filter(a => a !== action) as any;

      for (const other of otherActions) {
        if (prev[other] === newValue) {
          updates[other] = prev[action];
        }
      }

      return { ...prev, ...updates };
    });
  };

  return (
    <div className="space-y-6 text-xs text-ink">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-ink">Follow up behavior</h4>
        <div className="flex flex-col space-y-2">
          <label className="flex items-center space-x-3 cursor-pointer select-none">
            <input
              type="radio"
              name="followUpBehavior"
              value="queue"
              checked={settings.followUpBehavior === 'queue'}
              onChange={() => onUpdate({ followUpBehavior: 'queue' })}
              className="w-4 h-4 text-ink border-ink/30 focus:ring-0 accent-ink"
            />
            <span className="font-semibold text-xs text-ink">Queue (Send chat input as queue)</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer select-none">
            <input
              type="radio"
              name="followUpBehavior"
              value="steering"
              checked={settings.followUpBehavior === 'steering'}
              onChange={() => onUpdate({ followUpBehavior: 'steering' })}
              className="w-4 h-4 text-ink border-ink/30 focus:ring-0 accent-ink"
            />
            <span className="font-semibold text-xs text-ink">Steering (Send chat input as steering)</span>
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-ink">Keyboard Shortcuts</h4>
        <p className="text-ink/60">Customize your chat shortcuts. Each action must have a unique shortcut.</p>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-ink">Send Message</span>
            <select
              value={settings.keybindingSend || 'Enter'}
              onChange={(e) => handleKeybindingChange('keybindingSend', e.target.value as KeybindingOption)}
              className="bg-transparent border border-ink/20 rounded px-2 py-1 outline-none focus:border-ink text-xs min-w-[140px]"
            >
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-ink">New Line</span>
            <select
              value={settings.keybindingNewLine || 'Shift + Enter'}
              onChange={(e) => handleKeybindingChange('keybindingNewLine', e.target.value as KeybindingOption)}
              className="bg-transparent border border-ink/20 rounded px-2 py-1 outline-none focus:border-ink text-xs min-w-[140px]"
            >
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-ink">Steering</span>
            <select
              value={settings.keybindingSteering || 'Ctrl / Cmd + Enter'}
              onChange={(e) => handleKeybindingChange('keybindingSteering', e.target.value as KeybindingOption)}
              className="bg-transparent border border-ink/20 rounded px-2 py-1 outline-none focus:border-ink text-xs min-w-[140px]"
            >
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
