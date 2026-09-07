import React from 'react';
import type { SettingsState, SettingsCategoryId } from '@/types';

interface OtherSettingsProps {
  category: SettingsCategoryId;
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function OtherSettings({ category, settings, onUpdate }: OtherSettingsProps) {
  return (
    <div className="space-y-6 text-ink flex flex-col items-center justify-center py-16">
      <div className="text-sm font-semibold capitalize">{category.replace('-', ' ')} Settings</div>
      <div className="text-xs text-ink/60 text-center max-w-sm mt-2">
        This settings category is currently under construction and will be available soon.
      </div>
    </div>
  );
}
