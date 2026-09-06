import React, { useState } from 'react';
import { Info, Folder, Check, KeyRound, ShieldCheck, Cpu } from 'lucide-react';
import type { SettingsState } from '@/types';

interface GeneralSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function GeneralSettings({ settings, onUpdate }: GeneralSettingsProps) {
  const [binaryInput, setBinaryInput] = useState(settings.binaryPath);
  const [isSaved, setIsSaved] = useState(false);
  const [passkeyAdded, setPasskeyAdded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSaveCLI = () => {
    onUpdate({ binaryPath: binaryInput });
    setIsSaved(true);
    setToastMessage('OMP binary path configuration updated successfully.');
    setTimeout(() => {
      setIsSaved(false);
      setToastMessage(null);
    }, 2500);
  };

  const handleAddPasskey = () => {
    setPasskeyAdded(true);
    setToastMessage('Passkey registration token generated for this host.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSignOutEverywhere = () => {
    setToastMessage('Active sessions on all other devices have been invalidated.');
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="space-y-8 text-xs text-[#141310]">
      {toastMessage && (
        <div className="p-2.5 rounded-lg bg-[#141310] text-[#f4f1ea] flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center space-x-2">
            <Check size={14} className="text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
          <button type="button" onClick={() => setToastMessage(null)} className="text-xs text-[#f4f1ea]/60 hover:text-white ml-2">
            dismiss
          </button>
        </div>
      )}

      {/* 1. Passkeys Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[#141310]">Passkeys</h4>
        
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-[#141310]/90">Current device</span>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleAddPasskey}
                className="px-3 py-1.5 rounded-lg border border-[#141310]/20 bg-[#faf8f3] hover:bg-[#141310]/5 active:scale-98 text-xs font-medium text-[#141310] transition-all flex items-center space-x-1.5 shadow-2xs"
              >
                <KeyRound size={12} className="text-[#141310]/70" />
                <span>{passkeyAdded ? 'passkey registered' : 'add passkey'}</span>
              </button>
              
              <button
                type="button"
                onClick={handleSignOutEverywhere}
                className="text-xs text-[#141310]/60 hover:text-[#141310] transition-colors cursor-pointer"
              >
                sign out everywhere
              </button>
            </div>
          </div>

          <p className="text-[11px] text-[#141310]/55 leading-relaxed">
            Passkeys are available only when the UI password lock is enabled.
          </p>
          <p className="text-[11px] text-[#141310]/55 leading-relaxed">
            {passkeyAdded ? 'Host authorized with ECDSA key pair.' : 'No passkeys saved for this host yet.'}
          </p>
        </div>
      </div>

      <div className="border-t border-[#141310]/10" />

      {/* 2. Trusted App Links Section */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[#141310]">Trusted app links</h4>
        <p className="text-[11px] text-[#141310]/65 leading-relaxed">
          Links listed here open without asking again on this device. Other app links always ask before opening.
        </p>
        <p className="text-[11px] text-[#141310]/55 leading-relaxed">
          No trusted app links on this device. Choose &ldquo;Trust and open&rdquo; when opening a link to add it here.
        </p>
      </div>

      <div className="border-t border-[#141310]/10" />

      {/* 3. OMP CLI Section */}
      <div className="space-y-4">
        <div className="flex items-center space-x-1.5">
          <h4 className="text-sm font-semibold text-[#141310]">OMP CLI</h4>
          <Cpu size={14} className="text-[#141310]/50" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-medium text-[#141310]/90">
            <span>OMP Binary Path</span>
            <span title="The absolute file path to the bun-compatible omp (Oh-My-Pi) executable." className="cursor-help">
              <Info size={12} className="text-[#141310]/40 hover:text-[#141310]" />
            </span>
          </div>

          <div className="flex items-center space-x-2 max-w-xl">
            <input
              type="text"
              value={binaryInput}
              onChange={(e) => setBinaryInput(e.target.value)}
              className="flex-1 bg-[#faf8f3] border border-[#141310]/20 rounded-lg px-3 py-2 text-xs font-mono text-[#141310] focus:outline-none focus:border-[#141310] transition-colors shadow-2xs"
            />
            <button
              type="button"
              onClick={() => setBinaryInput('/usr/local/bin/omp')}
              className="p-2 border border-[#141310]/20 bg-[#faf8f3] hover:bg-[#141310]/5 rounded-lg text-[#141310]/70 hover:text-[#141310] transition-colors"
              title="Locate binary"
            >
              <Folder size={15} />
            </button>
          </div>
        </div>

        {/* Checkbox: Show OMP update notifications */}
        <label className="flex items-center space-x-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.showUpdateNotifications}
            onChange={(e) => onUpdate({ showUpdateNotifications: e.target.checked })}
            className="w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 focus:ring-offset-0 accent-[#141310]"
          />
          <span className="text-xs text-[#141310]/85">Show OMP update notifications</span>
        </label>

        <div>
          <button
            type="button"
            onClick={handleSaveCLI}
            className="px-3.5 py-1.5 rounded-lg bg-[#141310]/10 hover:bg-[#141310] text-[#141310] hover:text-[#f4f1ea] border border-[#141310]/15 text-xs font-semibold transition-all shadow-2xs"
          >
            {isSaved ? 'changes saved' : 'save changes'}
          </button>
        </div>
      </div>

      <div className="border-t border-[#141310]/10" />

      {/* 4. OMPChamber Tools Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-1.5">
          <h4 className="text-sm font-semibold text-[#141310]">OMPChamber Tools</h4>
          <ShieldCheck size={14} className="text-[#141310]/50" />
        </div>

        <div className="space-y-2.5">
          <label className="flex items-center space-x-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.agentControlTool}
              onChange={(e) => onUpdate({ agentControlTool: e.target.checked })}
              className="w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <span className="text-xs text-[#141310]/85">Agent control tool</span>
            <span title="Allows the AI agent to execute diagnostic inspections and file updates." className="cursor-help">
              <Info size={12} className="text-[#141310]/40" />
            </span>
          </label>

          <label className="flex items-center space-x-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.ompChamberWebTool}
              onChange={(e) => onUpdate({ ompChamberWebTool: e.target.checked })}
              className="w-4 h-4 rounded border-[#141310]/30 text-[#141310] focus:ring-0 accent-[#141310]"
            />
            <span className="text-xs text-[#141310]/85">OMPChamber Web tool</span>
            <span title="Enables web preview rendering and live terminal socket bridge." className="cursor-help">
              <Info size={12} className="text-[#141310]/40" />
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
