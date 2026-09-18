import { Check, Moon, Palette, Sun } from 'lucide-preact';
import type { SettingsState } from '@/shared/types';

interface AppearanceSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function AppearanceSettings({ settings, onUpdate }: AppearanceSettingsProps) {
  const themes = [
    { id: 'paper', name: 'E-Ink Paper', desc: 'Tema terang bawaan E-Ink Monochrome.', icon: Sun },
    { id: 'one-dark-pro-soft', name: 'One Dark Pro Soft', desc: 'Tema gelap ala One Dark Pro.', icon: Moon }
  ] as const;

  return (
    <div className="w-full space-y-8 text-xs text-ink">
      <section className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-ink/10 pb-2">
          <Palette size={16} className="text-ink/60" />
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink/80">Theme Preferences</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {themes.map(theme => (
            <button
              key={theme.id}
              onClick={() => onUpdate({ theme: theme.id as any })}
              className={`flex items-start space-x-3 p-3 rounded-lg border text-left transition-all ${
                settings.theme === theme.id 
                  ? 'border-ink bg-ink/5 ring-1 ring-ink/20' 
                  : 'border-ink/20 bg-paper hover:border-ink/40 hover:bg-ink/5'
              }`}
            >
              <div className={`p-1.5 rounded-full ${settings.theme === theme.id ? 'bg-ink text-paper' : 'bg-canvas text-ink/60'}`}>
                <theme.icon size={16} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-ink">{theme.name}</div>
                <div className="text-ink/60 mt-0.5 leading-relaxed">{theme.desc}</div>
              </div>
              {settings.theme === theme.id && (
                <Check size={16} className="text-ink mt-1" />
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
