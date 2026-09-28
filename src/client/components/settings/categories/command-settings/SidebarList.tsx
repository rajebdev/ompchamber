import type { FunctionComponent } from 'preact/compat';
import { Terminal } from 'lucide-preact';
import type { CommandItem } from '@/shared/types';
import type { ProjectOption } from '@/client/components/settings/ProjectSelectorDropdown';
import { SettingsSidebarList } from '@/client/components/settings/SettingsSidebarList';

interface CommandSidebarListProps {
  commands: CommandItem[];
  selectedCommandId: string | null;
  onSelectCommand: (commandId: string) => void;
  onAddNewCommand: () => void;
  selectedProject: string;
  onChangeProject: (project: string) => void;
  /** Real workspace folders; defaults to the shared placeholder list. */
  projectOptions?: ProjectOption[];
}

export const CommandSidebarList: FunctionComponent<CommandSidebarListProps> = ({
  commands,
  selectedCommandId,
  onSelectCommand,
  onAddNewCommand,
  selectedProject,
  onChangeProject,
  projectOptions,
}) => (
  <SettingsSidebarList
    items={commands}
    selectedId={selectedCommandId}
    onSelect={onSelectCommand}
    onAddNew={onAddNewCommand}
    addTitle="Create new command"
    builtInLabel="Built-in Commands"
    customLabel="Command Files"
    formatName={(name) => `/${name}`}
    nameClassName="font-mono font-semibold text-xs text-ink truncate"
    selectedProject={selectedProject}
    onChangeProject={onChangeProject}
    {...(projectOptions ? { projectOptions } : {})}
    renderIcon={(isBuiltIn) => (
      <Terminal className={`w-3.5 h-3.5 ${isBuiltIn ? 'text-ink/70' : 'text-ink/60'} flex-shrink-0`} />
    )}
  />
);
