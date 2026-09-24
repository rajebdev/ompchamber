import { Palette } from 'lucide-preact';
import type { SettingsState } from '@/shared/types';
import { resolveThemeId } from '@/shared/lib/theme/catalog';
import { ThemeGrid } from '@/client/components/settings/categories/appearance-settings/ThemeGrid';

interface AppearanceSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function AppearanceSettings({ settings, onUpdate }: AppearanceSettingsProps) {
  return (
    <div className="w-full space-y-8 text-xs text-ink">
      <section className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-ink/10 pb-2">
          <Palette size={16} className="text-ink/60" />
          <h3 className="font-semibold text-sm uppercase tracking-wider text-ink/80">Theme Preferences</h3>
        </div>

        <ThemeGrid
          selectedId={settings.theme}
          onSelect={(theme) => onUpdate({ theme: resolveThemeId(theme) })}
        />
      </section>
    </div>
  );
}
