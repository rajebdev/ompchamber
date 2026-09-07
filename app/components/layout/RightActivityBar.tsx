import React from 'react';
import { Files, Search, GitBranch, Terminal, Layers, CircleUser, Settings } from 'lucide-react';

export type RightPanelType = 'files' | 'search' | 'git' | 'terminal' | 'context';

interface RightActivityBarProps {
  activePanel: RightPanelType;
  onChangePanel: (panel: RightPanelType) => void;
  onOpenSettings?: () => void;
}

export function RightActivityBar({ activePanel, onChangePanel, onOpenSettings }: RightActivityBarProps) {
  const getBtnClass = (panel: RightPanelType) => {
    const base = "relative w-full h-10 flex items-center justify-center transition-colors border-l-2";
    const isActive = activePanel === panel;
    return `${base} ${isActive ? 'text-ink border-ink bg-ink/5' : 'text-ink/40 border-transparent hover:text-ink hover:bg-ink/5'}`;
  };

  return (
    <nav className="w-12 flex-shrink-0 border-l border-ink/10 bg-paper flex flex-col items-center py-3 space-y-2 z-10">
      {/* Top Icons */}
      <div className="flex flex-col items-center space-y-1 w-full">
        <button 
          className={getBtnClass('files')}
          onClick={() => onChangePanel('files')}
          title="Files"
        >
          <Files size={16} />
        </button>
        <button 
          className={getBtnClass('search')}
          onClick={() => onChangePanel('search')}
          title="Search"
        >
          <Search size={16} />
        </button>
        <button 
          className={getBtnClass('git')}
          onClick={() => onChangePanel('git')}
          title="Source Control"
        >
          <GitBranch size={16} />
        </button>
        <button 
          className={getBtnClass('context')}
          onClick={() => onChangePanel('context')}
          title="Context & Telemetry"
        >
          <Layers size={16} />
        </button>
        <button 
          className={getBtnClass('terminal')}
          onClick={() => onChangePanel('terminal')}
          title="Terminal (Bun)"
        >
          <Terminal size={16} />
        </button>
      </div>
      
      <div className="flex-1" />
      
      {/* Bottom Icons */}
      <div className="flex flex-col items-center space-y-1 w-full pb-2">
        <button 
          type="button"
          onClick={() => onChangePanel('context')}
          className={getBtnClass('context')}
          title="Context Inspector"
        >
          <CircleUser size={16} />
        </button>
        <button 
          type="button"
          onClick={onOpenSettings}
          className="relative w-full h-10 flex items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/5 transition-colors border-l-2 border-transparent"
          title="Settings (Cmd+,)"
        >
          <Settings size={16} />
        </button>
      </div>
    </nav>
  );
}
