import React, { useState, useEffect } from 'react';
import type { CommandItem, SettingsState } from '@/types';
import { CommandSidebarList } from '@/components/settings/categories/command-settings/SidebarList';
import { CommandDetailPane } from '@/components/settings/categories/command-settings/DetailPane';

interface CommandSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

export const CommandSettings: React.FC<CommandSettingsProps> = () => {
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [selectedProject, setSelectedProject] = useState('ompchamber');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/commands')
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        const list = data?.commands || [];
        setCommands(list);
        if (list.length > 0) {
          setSelectedCommandId(list[0].id);
        }
      })
      .catch(err => console.error('Failed to load commands from API:', err))
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleAddNewCommand = () => {
    setIsCreatingNew(true);
    setSelectedCommandId(null);
  };

  const handleSelectCommand = (commandId: string) => {
    setIsCreatingNew(false);
    setSelectedCommandId(commandId);
  };

  const handleSaveCommand = (updated: CommandItem) => {
    const targetCmd: CommandItem = isCreatingNew
      ? { ...updated, id: `cmd-${Date.now()}`, isBuiltIn: false }
      : updated;

    fetch('/api/settings/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: targetCmd }),
    })
      .then(res => res.json())
      .then(data => {
        if (data?.commands) {
          setCommands(data.commands);
        } else {
          setCommands(prev => {
            const exists = prev.some(c => c.id === targetCmd.id);
            return exists ? prev.map(c => c.id === targetCmd.id ? targetCmd : c) : [...prev, targetCmd];
          });
        }
        setSelectedCommandId(targetCmd.id);
        setIsCreatingNew(false);
      })
      .catch(err => console.error('Failed to save command via API:', err));
  };

  const handleDeleteCommand = (commandId: string) => {
    fetch('/api/settings/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteId: commandId }),
    })
      .then(res => res.json())
      .then(data => {
        const nextList = data?.commands || commands.filter(c => c.id !== commandId);
        setCommands(nextList);
        if (selectedCommandId === commandId) {
          setSelectedCommandId(nextList[0]?.id || null);
        }
      })
      .catch(err => console.error('Failed to delete command via API:', err));
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

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-ink/40">
        Loading commands from database...
      </div>
    );
  }

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
