import { useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact/compat';
import type { CommandItem, SettingsState } from '@/shared/types';
import { CommandSidebarList } from '@/client/components/settings/categories/command-settings/SidebarList';
import { CommandDetailPane } from '@/client/components/settings/categories/command-settings/DetailPane';
import { LoadingState } from '@/client/components/settings/LoadingState';
import { useCrudList } from '@/client/hooks/settings/crud-list';

interface CommandSettingsProps {
  settings: SettingsState;
  onUpdate: (settings: SettingsState) => void;
}

export const CommandSettings: FunctionComponent<CommandSettingsProps> = () => {
  const [selectedProject, setSelectedProject] = useState('ompchamber');
  const { items: commands, selectedId, selected: selectedCommand, isCreatingNew, isLoading, select, startCreate, save, remove } =
    useCrudList<CommandItem>({
      endpoint: '/api/settings/commands',
      listKey: 'commands',
      bodyKey: 'command',
      messages: {
        load: 'Failed to load commands from API:',
        save: 'Failed to save command via API:',
        delete: 'Failed to delete command via API:',
      },
      cacheKey: 'command',
      buildNew: (updated) => ({ ...updated, id: `cmd-${Date.now()}`, isBuiltIn: false }),
      buildUpdate: (updated) => updated,
      isDeleteError: (data) => Boolean((data as { error?: string } | null)?.error),
    });

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
    return <LoadingState>Loading commands from database...</LoadingState>;
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper">
      <CommandSidebarList
        commands={commands}
        selectedCommandId={isCreatingNew ? null : selectedId}
        onSelectCommand={select}
        onAddNewCommand={startCreate}
        selectedProject={selectedProject}
        onChangeProject={setSelectedProject}
      />

      <div className="flex-1 h-full overflow-hidden flex flex-col">
        {isCreatingNew ? (
          <CommandDetailPane
            command={emptyCommandTemplate}
            isNew={true}
            onSave={save}
          />
        ) : selectedCommand ? (
          <CommandDetailPane
            key={selectedCommand.id}
            command={selectedCommand}
            isNew={false}
            onSave={save}
            onDelete={remove}
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
