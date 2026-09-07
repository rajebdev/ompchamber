import React, { useState, useEffect } from 'react';
import type { CommandItem, SettingsState } from '@/types';
import { DEFAULT_COMMANDS_LIST } from '@/data/commandData';
import { CommandSidebarList } from './command-settings/CommandSidebarList';
import { CommandDetailPane } from './command-settings/CommandDetailPane';

interface CommandSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

const STORAGE_KEY = 'omp_commands_settings';

export const CommandSettings: React.FC<CommandSettingsProps> = () => {
  const [commands, setCommands] = useState<CommandItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return DEFAULT_COMMANDS_LIST;
  });

  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(() => {
    return DEFAULT_COMMANDS_LIST[0]?.id || null;
  });

  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedProject, setSelectedProject] = useState('ompchamber');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
    } catch {
      // ignore
    }
  }, [commands]);

  const handleAddNewCommand = () => {
    setIsCreatingNew(true);
    setSelectedCommandId(null);
  };

  const handleSelectCommand = (commandId: string) => {
    setIsCreatingNew(false);
    setSelectedCommandId(commandId);
  };

  const handleSaveCommand = (updated: CommandItem) => {
    if (isCreatingNew) {
      const newCmd: CommandItem = {
        ...updated,
        id: `cmd-${Date.now()}`,
        isBuiltIn: false,
      };
      setCommands((prev) => [...prev, newCmd]);
      setSelectedCommandId(newCmd.id);
      setIsCreatingNew(false);
    } else {
      setCommands((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
  };

  const handleDeleteCommand = (commandId: string) => {
    const confirm = window.confirm('Are you sure you want to delete this command?');
    if (!confirm) return;

    setCommands((prev) => prev.filter((c) => c.id !== commandId));
    if (selectedCommandId === commandId) {
      setSelectedCommandId(commands[0]?.id || null);
    }
  };

  const selectedCommand = commands.find((c) => c.id === selectedCommandId) || commands[0];

  const emptyCommandTemplate: CommandItem = {
    id: `new-${Date.now()}`,
    name: 'new-command',
    description: '',
    scope: 'user',
    overrideAgent: 'Not selected',
    overrideModel: 'Not selected',
    template: 'Execute task: $ARGUMENTS',
    isBuiltIn: false,
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper">
      <CommandSidebarList
        commands={commands}
        selectedCommandId={isCreatingNew ? null : selectedCommandId}
        onSelectCommand={handleSelectCommand}
        onAddNewCommand={handleAddNewCommand}
        selectedProject={selectedProject}
        onChangeProject={setSelectedProject}
      />

      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {isCreatingNew ? (
          <CommandDetailPane
            command={emptyCommandTemplate}
            isNew={true}
            onSave={handleSaveCommand}
          />
        ) : selectedCommand ? (
          <CommandDetailPane
            key={selectedCommand.id}
            command={selectedCommand}
            isNew={false}
            onSave={handleSaveCommand}
            onDelete={handleDeleteCommand}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs font-mono text-ink/40">
            Select a command or click + to create one
          </div>
        )}
      </div>
    </div>
  );
};
