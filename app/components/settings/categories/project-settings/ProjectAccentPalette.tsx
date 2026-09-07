import React from 'react';
import { X } from 'lucide-react';
import type { AccentColorOption } from '@/types';

const FALLBACK_OPTIONS: AccentColorOption[] = [
  { label: 'None', value: '', bgHex: 'transparent' },
  { label: 'Sky Blue', value: '#38bdf8', bgHex: '#38bdf8' },
  { label: 'Light Green', value: '#a3e635', bgHex: '#a3e635' },
  { label: 'Coral', value: '#f87171', bgHex: '#f87171' },
  { label: 'Amber', value: '#fbbf24', bgHex: '#fbbf24' },
  { label: 'Teal', value: '#2dd4bf', bgHex: '#2dd4bf' },
  { label: 'Slate', value: '#94a3b8', bgHex: '#94a3b8' },
  { label: 'Rose', value: '#f43f5e', bgHex: '#f43f5e' },
  { label: 'Vivid Blue', value: '#3b82f6', bgHex: '#3b82f6' },
  { label: 'Lime Green', value: '#84cc16', bgHex: '#84cc16' },
];

interface ProjectAccentPaletteProps {
  accentColor: string;
  onSelectColor: (color: string) => void;
  options?: AccentColorOption[];
}

export function ProjectAccentPalette({
  accentColor,
  onSelectColor,
  options = FALLBACK_OPTIONS,
}: ProjectAccentPaletteProps) {
  const colorList = options && options.length > 0 ? options : FALLBACK_OPTIONS;

  return (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold text-ink">
        Accent Color
      </h4>

      <div className="flex flex-wrap items-center gap-2.5">
        {colorList.map((opt) => {
          const isSelected = accentColor === opt.value;

          if (opt.value === '') {
            return (
              <button
                key="none"
                type="button"
                onClick={() => onSelectColor('')}
                title="Default / No Accent"
                className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                  isSelected
                    ? 'border-ink bg-ink/10 ring-2 ring-ink/30 ring-offset-2 ring-offset-paper'
                    : 'border-ink/25 bg-paper hover:border-ink/50 text-ink/60'
                }`}
              >
                <X size={12} strokeWidth={2.2} />
              </button>
            );
          }

          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectColor(opt.value)}
              title={opt.label}
              style={{ backgroundColor: opt.bgHex }}
              className={`w-7 h-7 rounded-full transition-all cursor-pointer shadow-2xs ${
                isSelected
                  ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper scale-105'
                  : 'hover:scale-105 opacity-90 hover:opacity-100'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
