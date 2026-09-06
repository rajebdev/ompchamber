import React from 'react';
import { Palette, Check, Sun, Moon, Sparkles } from 'lucide-react';
import type { SettingsState } from '@/types';

interface AppearanceSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function AppearanceSettings({ settings, onUpdate }: AppearanceSettingsProps) {
  const themes = [
    { id: 'paper', name: 'E-Ink Paper Monochrome', desc: 'Standard light off-white palette (#faf8f3) with sharp typography.', icon: Sun },
    { id: 'contrast', name: 'High Contrast Ink', desc: 'Maximized legibility with pure black ink and crisp borders.', icon: Sparkles },
    { id: 'noir', name: 'Slate Paper Noir', desc: 'Muted dark slate paper tone for low-light environments.', icon: Moon }
  ] as const;

  const fontSizes = [
    { id: 'compact', label: 'Compact', size: '12px' },
    { id: 'standard', label: 'Standard', size: '13px' },
    { id: 'comfort', label: 'Comfort', size: '14px' }
  ] as const;

  const editorFonts = ['JetBrains Mono', 'Fira Code', 'Geist Mono', 'Cascadia Code', 'Menlo'];

  return (
    <div className="space-y-8 text-xs text-[#141310]">
      {/* 1. Theme Palette */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-semibold text-[#141310]">Color & Theme Mode</h4>
          <Palette size={14} className="text-[#141310]/50" />
        </div>
        <p className="text-[11px] text-[#141310]/60">
          OMPChamber follows strict e-ink paper aesthetics without fluorescent accents.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {themes.map(t => {
            const isSelected = settings.theme === t.id;
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                onClick={() => onUpdate({ theme: t.id })}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 select-none ${
                  isSelected
                    ? 'border-[#141310] bg-[#141310]/5 shadow-xs ring-1 ring-[#141310]'
                    : 'border-[#141310]/15 bg-[#faf8f3] hover:border-[#141310]/30 hover:bg-[#141310]/2'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Icon size={15} className={isSelected ? 'text-[#141310]' : 'text-[#141310]/60'} />
                    <span className="font-semibold text-xs text-[#141310]">{t.name}</span>
                  </div>
                  {isSelected && <Check size={14} className="text-[#141310]" />}
                </div>
                <p className="text-[10px] text-[#141310]/60 leading-relaxed">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[#141310]/10" />

      {/* 2. Typography & Scale */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[#141310]">UI Density & Font Size</h4>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {fontSizes.map(fs => (
            <button
              key={fs.id}
              type="button"
              onClick={() => onUpdate({ fontSize: fs.id })}
              className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                settings.fontSize === fs.id
                  ? 'border-[#141310] bg-[#141310] text-[#f4f1ea]'
                  : 'border-[#141310]/20 bg-[#faf8f3] text-[#141310] hover:bg-[#141310]/5'
              }`}
            >
              <div className="font-bold text-xs">{fs.label}</div>
              <div className="text-[10px] opacity-70 font-mono mt-0.5">{fs.size}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[#141310]/10" />

      {/* 3. Code Editor Font */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[#141310]">Editor Monospace Font</h4>
        <div className="flex flex-wrap gap-2">
          {editorFonts.map(font => (
            <button
              key={font}
              type="button"
              onClick={() => onUpdate({ editorFont: font })}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                settings.editorFont === font
                  ? 'border-[#141310] bg-[#141310] text-[#f4f1ea]'
                  : 'border-[#141310]/20 bg-[#faf8f3] text-[#141310] hover:bg-[#141310]/5'
              }`}
            >
              {font}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
