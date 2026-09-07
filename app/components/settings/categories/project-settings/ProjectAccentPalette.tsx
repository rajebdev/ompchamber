import React from 'react';
import { X } from 'lucide-react';
import { ACCENT_COLOR_OPTIONS } from '@/data/projectData';

interface ProjectAccentPaletteProps {
  accentColor: string;
  onSelectColor: (color: string) => void;
}

export function ProjectAccentPalette({
  accentColor,
  onSelectColor,
}: ProjectAccentPaletteProps) {
  return (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold text-ink">
        Accent Color
      </h4>

      <div className="flex flex-wrap items-center gap-2.5">
        {ACCENT_COLOR_OPTIONS.map((opt) => {
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
