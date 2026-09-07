import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Plus, ChevronDown, Folder } from 'lucide-react';
import type { CommandItem } from '@/types';

interface CommandSidebarListProps {
  commands: CommandItem[];
  selectedCommandId: string | null;
  onSelectCommand: (commandId: string) => void;
  onAddNewCommand: () => void;
  selectedProject: string;
  onChangeProject: (project: string) => void;
}

export const CommandSidebarList: React.FC<CommandSidebarListProps> = ({
  commands,
  selectedCommandId,
  onSelectCommand,
  onAddNewCommand,
  selectedProject,
  onChangeProject,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const builtInCommands = commands.filter((c) => c.isBuiltIn);
  const customCommands = commands.filter((c) => !c.isBuiltIn);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const projects = [
    { id: 'ompchamber', name: 'ompchamber' },
    { id: 'workspace-edge', name: 'workspace-edge' },
    { id: 'global', name: 'global config' },
  ];

  return (
    <div className="w-56 sm:w-64 border-r border-ink/10 h-full flex flex-col bg-paper/50 flex-shrink-0 select-none">
      {/* 1. Project Selector Dropdown */}
      <div className="p-3 border-b border-ink/10 relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-ink/20 hover:border-ink/40 bg-paper text-ink text-xs font-medium transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center gap-2 truncate">
            <Folder size={14} className="text-ink/60 flex-shrink-0" />
            <span className="truncate">{selectedProject}</span>
          </div>
          <ChevronDown size={14} className="text-ink/50 flex-shrink-0" />
        </button>

        {isDropdownOpen && (
          <div className="absolute top-12 left-3 right-3 bg-paper border border-ink/20 rounded-lg shadow-lg z-30 py-1 divide-y divide-ink/5 animate-in fade-in zoom-in-95 duration-100">
            {projects.map((proj) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => {
                  onChangeProject(proj.id);
                  setIsDropdownOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-ink/5 transition-colors cursor-pointer ${
                  selectedProject === proj.id ? 'font-semibold text-ink bg-ink/5' : 'text-ink/80'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder size={13} className="text-ink/60" />
                  <span className="truncate">{proj.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Counter & Plus button */}
      <div className="px-3.5 py-2.5 border-b border-ink/10 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">
          Total {commands.length}
        </span>
        <button
          type="button"
          onClick={onAddNewCommand}
          title="Create new command"
          className="p-1 rounded text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.2} />
        </button>
      </div>

      {/* 3. Scrollable List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-3 text-xs">
        {/* BUILT-IN COMMANDS */}
        <div>
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold text-ink/50 uppercase tracking-wider">
            Built-in Commands
          </div>
          <div className="space-y-0.5">
            {builtInCommands.map((cmd) => {
              const isSelected = cmd.id === selectedCommandId;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => onSelectCommand(cmd.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer flex flex-col gap-0.5 group ${
                    isSelected
                      ? 'bg-ink/10 text-ink font-medium shadow-2xs'
                      : 'text-ink/80 hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Terminal className="w-3.5 h-3.5 text-ink/70 flex-shrink-0" />
                      <span className="font-mono font-semibold text-xs text-ink truncate">/{cmd.name}</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-ink/10 text-ink/70 font-medium">
                      {cmd.scope}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink/60 line-clamp-1 leading-snug pl-5">
                    {cmd.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* CUSTOM COMMANDS */}
        <div>
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold text-ink/50 uppercase tracking-wider flex items-center justify-between">
            <span>Custom Commands</span>
            <span className="text-[10px] font-normal">{customCommands.length}</span>
          </div>
          <div className="space-y-0.5">
            {customCommands.map((cmd) => {
              const isSelected = cmd.id === selectedCommandId;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => onSelectCommand(cmd.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer flex flex-col gap-0.5 group ${
                    isSelected
                      ? 'bg-ink/10 text-ink font-medium shadow-2xs'
                      : 'text-ink/80 hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Terminal className="w-3.5 h-3.5 text-ink/60 flex-shrink-0" />
                      <span className="font-mono font-semibold text-xs text-ink truncate">/{cmd.name}</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-ink/10 text-ink/70 font-medium">
                      {cmd.scope}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink/60 line-clamp-1 leading-snug pl-5">
                    {cmd.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
