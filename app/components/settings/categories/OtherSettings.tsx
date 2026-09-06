import React, { useState } from 'react';
import { Bell, Clock, Command, Mic, Plug, BarChart3, Info, Check, Volume2, Shield } from 'lucide-react';
import type { SettingsState, SettingsCategoryId } from '@/types';
import packageJson from '../../../../package.json';

interface OtherSettingsProps {
  category: SettingsCategoryId;
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function OtherSettings({ category, settings, onUpdate }: OtherSettingsProps) {
  const [clearedCache, setClearedCache] = useState(false);

  if (category === 'notifications') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[#141310]">System Alerts</h4>
          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) => onUpdate({ notificationsEnabled: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Enable browser desktop notifications</div>
              <div className="text-[11px] text-[#141310]/60">Receive alerts when long running builds or agents finish tasks.</div>
            </div>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.buildFailureAlert}
              onChange={(e) => onUpdate({ buildFailureAlert: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <div>
              <div className="font-semibold text-xs text-[#141310]">Signal red alerts on CI build failure</div>
              <div className="text-[11px] text-[#141310]/60">Immediately notify when exit 1 occurs in the bun runner.</div>
            </div>
          </label>
        </div>
      </div>
    );
  }

  if (category === 'sessions') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[#141310]">Session Retention & History</h4>
          <div className="flex items-center space-x-3">
            <span className="text-xs text-[#141310]/80">Keep completed chat sessions for:</span>
            <select className="bg-[#faf8f3] border border-[#141310]/20 rounded-lg px-2.5 py-1 text-xs">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="forever">Indefinitely (Local SQLite)</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (category === 'shortcuts') {
    const shortcutList = [
      { key: '⌘ / Ctrl + K', action: 'Quick Command Palette' },
      { key: '⌘ / Ctrl + J', action: 'Toggle Terminal Panel' },
      { key: '⌘ / Ctrl + B', action: 'Toggle Sidebar' },
      { key: '⌘ / Ctrl + Shift + F', action: 'Global Search' },
      { key: '⌘ / Ctrl + N', action: 'Start New Session' },
      { key: '⌘ / Ctrl + S', action: 'Save Active File' }
    ];

    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <h4 className="text-sm font-semibold text-[#141310]">Keyboard Shortcuts</h4>
        <div className="space-y-2">
          {shortcutList.map(s => (
            <div key={s.key} className="flex items-center justify-between p-2.5 bg-[#faf8f3] border border-[#141310]/15 rounded-lg">
              <span className="text-xs text-[#141310]/80">{s.action}</span>
              <kbd className="px-2 py-0.5 font-mono text-[11px] bg-[#141310]/5 border border-[#141310]/20 rounded text-[#141310]">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (category === 'voice') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <h4 className="text-sm font-semibold text-[#141310]">Voice Input & Dictation</h4>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <Mic size={16} className="text-[#141310]/60" />
            <span className="text-xs text-[#141310]/80">Audio Input Device:</span>
            <select className="bg-[#faf8f3] border border-[#141310]/20 rounded-lg px-2.5 py-1 text-xs flex-1 max-w-xs">
              <option value="default">Default System Microphone</option>
              <option value="built-in">Built-in Microphone Array</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (category === 'integrations') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <h4 className="text-sm font-semibold text-[#141310]">Connected Integrations</h4>
        <div className="space-y-2.5">
          <div className="p-3 bg-[#faf8f3] border border-[#141310]/15 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Plug size={16} className="text-[#141310]/60" />
              <div>
                <div className="font-semibold text-xs text-[#141310]">GitHub App Webhook</div>
                <div className="text-[10px] text-[#141310]/50">Sync pull requests and automated reviews</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
              Active
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (category === 'usage') {
    return (
      <div className="space-y-6 text-xs text-[#141310]">
        <h4 className="text-sm font-semibold text-[#141310]">Chamber Telemetry & Quotas</h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-[#faf8f3] border border-[#141310]/15 rounded-xl space-y-2">
            <div className="text-[11px] text-[#141310]/60">Build Minute Quota</div>
            <div className="text-lg font-bold text-[#141310]">142 / 500 min</div>
            <div className="w-full bg-[#141310]/10 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#141310] h-full w-[28.4%]" />
            </div>
          </div>

          <div className="p-3 bg-[#faf8f3] border border-[#141310]/15 rounded-xl space-y-2">
            <div className="text-[11px] text-[#141310]/60">Local Bun SQLite Cache</div>
            <div className="text-lg font-bold text-[#141310]">24.8 MB</div>
            <button
              type="button"
              onClick={() => { setClearedCache(true); setTimeout(() => setClearedCache(false), 2000); }}
              className="px-2.5 py-1 text-[10px] font-semibold border border-[#141310]/20 rounded-md hover:bg-[#141310]/5 transition-colors"
            >
              {clearedCache ? 'Cache Purged' : 'Clear Disk Cache'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // About Category
  return (
    <div className="space-y-6 text-xs text-[#141310]">
      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 rounded-xl bg-[#141310] flex items-center justify-center text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-xl">
          OMP
        </div>
        <div>
          <h4 className="text-base font-bold text-[#141310]">OMPChamber</h4>
          <p className="text-xs text-[#141310]/60 font-mono">v{packageJson.version} — Oh-My-Pi Agent Chamber</p>
        </div>
      </div>

      <div className="border-t border-[#141310]/10" />

      <div className="space-y-2 text-xs text-[#141310]/80">
        <div className="flex justify-between py-1 border-b border-[#141310]/5">
          <span className="text-[#141310]/50">Runtime Engine:</span>
          <span className="font-mono">Bun v1.2.4 (Native TS & ESM)</span>
        </div>
        <div className="flex justify-between py-1 border-b border-[#141310]/5">
          <span className="text-[#141310]/50">Framework:</span>
          <span className="font-mono">remisJS Edge Routes</span>
        </div>
        <div className="flex justify-between py-1 border-b border-[#141310]/5">
          <span className="text-[#141310]/50">Color Architecture:</span>
          <span>E-Ink Paper Monochrome</span>
        </div>
      </div>
    </div>
  );
}
