import React from 'react';
import { Files, Search, GitBranch, Terminal, CircleUser, Settings } from 'lucide-react';

export type RightPanelType = 'files' | 'search' | 'git' | 'terminal';

interface RightActivityBarProps {
  activePanel: RightPanelType;
  onChangePanel: (panel: RightPanelType) => void;
}

export function RightActivityBar({ activePanel, onChangePanel }: RightActivityBarProps) {
  const getBtnClass = (panel: RightPanelType) => {
    const base = "relative w-full h-10 flex items-center justify-center transition-colors border-l-2";
    const isActive = activePanel === panel;
    return `${base} ${isActive ? 'text-[#141310] border-[#141310] bg-[#141310]/5' : 'text-[#141310]/40 border-transparent hover:text-[#141310] hover:bg-[#141310]/5'}`;
  };

  return (
    <nav className="w-12 flex-shrink-0 border-l border-[#141310]/10 bg-[#faf8f3] flex flex-col items-center py-3 space-y-2 z-10">
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
        <button className="relative w-full h-10 flex items-center justify-center text-[#141310]/40 hover:text-[#141310] hover:bg-[#141310]/5 transition-colors border-l-2 border-transparent">
          <CircleUser size={16} />
        </button>
        <button className="relative w-full h-10 flex items-center justify-center text-[#141310]/40 hover:text-[#141310] hover:bg-[#141310]/5 transition-colors border-l-2 border-transparent">
          <Settings size={16} />
        </button>
      </div>
    </nav>
  );
}
