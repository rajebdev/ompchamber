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
      {/* View settings cleared as requested */}
    </div>
  );
}
