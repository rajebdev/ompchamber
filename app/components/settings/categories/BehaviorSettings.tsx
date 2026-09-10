import React, { useState, useEffect } from 'react';
import type { SettingsState } from '@/types';
import { BehaviorEditor } from '@/components/settings/categories/behavior-settings/Editor';

interface BehaviorSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

export const BehaviorSettings: React.FC<BehaviorSettingsProps> = () => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/behavior')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data && typeof data.rules === 'string') {
          setContent(data.rules);
        }
      })
      .catch((err) => console.error('Failed to load behavior rules from API:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleSave = (newContent: string) => {
    setContent(newContent);
    fetch('/api/settings/behavior', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: newContent }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.rules) setContent(data.rules);
      })
      .catch((err) => console.error('Failed to save behavior rules via API:', err));
  };

  const handleReset = () => {
    fetch('/api/settings/behavior', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.rules) setContent(data.rules);
      })
      .catch((err) => console.error('Failed to reset behavior rules via API:', err));
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-xs text-ink/40 bg-paper">
        Loading behavior rules from database...
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-paper">
      <BehaviorEditor
        content={content}
        onSave={handleSave}
        onReset={handleReset}
      />
    </div>
  );
};
