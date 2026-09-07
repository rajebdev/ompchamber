import React, { useState, useEffect } from 'react';
import type { SettingsState } from '@/types';
import { DEFAULT_BEHAVIOR_RULES } from '@/data/behaviorData';
import { BehaviorEditor } from './behavior-settings/BehaviorEditor';

interface BehaviorSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

const STORAGE_KEY = 'omp_behavior_rules';

export const BehaviorSettings: React.FC<BehaviorSettingsProps> = () => {
  const [content, setContent] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        return saved;
      }
    } catch {
      // ignore
    }
    return DEFAULT_BEHAVIOR_RULES;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, content);
    } catch {
      // ignore
    }
  }, [content]);

  const handleSave = (newContent: string) => {
    setContent(newContent);
  };

  const handleReset = () => {
    const confirm = window.confirm('Reset Global AGENTS.md to default rules?');
    if (confirm) {
      setContent(DEFAULT_BEHAVIOR_RULES);
    }
  };

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
