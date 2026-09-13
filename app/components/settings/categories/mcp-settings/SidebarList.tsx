import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Globe, Plus, ChevronDown, Folder } from 'lucide-react';
import type { McpServerItem } from '@/types';

export interface McpProjectOption {
  id: string;
  name: string;
  path: string;
}

interface McpSidebarListProps {
  servers: McpServerItem[];
  projects: McpProjectOption[];
  selectedServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onAddNewServer: () => void;
  selectedProject: string;
  onChangeProject: (projectPath: string) => void;
}

export const McpSidebarList: React.FC<McpSidebarListProps> = ({
  servers,
  projects,
  selectedServerId,
  onSelectServer,
  onAddNewServer,
  selectedProject,
  onChangeProject,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const activeProjectName = projects.find((proj) => proj.path === selectedProject)?.name ?? 'Global (all projects)';

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
            <span className="truncate">{activeProjectName}</span>
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
                  onChangeProject(proj.path);
                  setIsDropdownOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-ink/5 transition-colors cursor-pointer ${
                  selectedProject === proj.path ? 'font-semibold text-ink bg-ink/5' : 'text-ink/80'
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
          Total {servers.length}
        </span>
        <button
          type="button"
          onClick={onAddNewServer}
          title="Add MCP Server"
          className="p-1 rounded text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.2} />
        </button>
      </div>

      {/* 3. Scrollable List */}
      <div className="flex-1 scrollbar-overlay-container scrollbar-overlay-static p-1.5 space-y-3 text-xs">
        <div>
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold text-ink/50 uppercase tracking-wider flex items-center justify-between">
            <span>User Servers</span>
            <span className="text-[10px] font-normal">{servers.length}</span>
          </div>

          <div className="space-y-0.5">
            {servers.map((server) => {
              const isSelected = server.id === selectedServerId;
              const isCommand = server.reachType === 'command';
              const summary = isCommand
                ? server.commandArgs.join(' ')
                : server.linkUrl || 'No URL configured';

              return (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => onSelectServer(server.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer flex flex-col gap-0.5 group ${
                    isSelected
                      ? 'bg-ink/10 text-ink font-medium shadow-2xs'
                      : 'text-ink/80 hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          server.enabled ? 'bg-ink' : 'bg-ink/20'
                        }`}
                        title={server.enabled ? 'Enabled' : 'Disabled'}
                      />
                      <span className="font-semibold text-xs text-ink truncate">
                        {server.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-ink/40">
                      {isCommand ? (
                        <Terminal className="w-3.5 h-3.5" />
                      ) : (
                        <Globe className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] font-mono text-ink/60 line-clamp-1 leading-snug pl-4">
                    {summary}
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
