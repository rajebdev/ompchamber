import type { SettingsState } from '@/types';
import { ChatFollowUpSection } from '@/components/settings/categories/chat-settings/ChatFollowUpSection';
import { ChatKeybindingsSection } from '@/components/settings/categories/chat-settings/ChatKeybindingsSection';

interface ChatSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function ChatSettings({ settings, onUpdate }: ChatSettingsProps) {
  return (
    <div className="w-full space-y-7 text-xs text-ink">
      {/* 1. Follow-up Behavior (Interactive Selector Cards) */}
      <ChatFollowUpSection settings={settings} onUpdate={onUpdate} />

      {/* 2. Keyboard Shortcuts Configurator */}
      <ChatKeybindingsSection settings={settings} onUpdate={onUpdate} />
    </div>
  );
}
