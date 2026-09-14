import { Files, Search, GitBranch, Terminal, Layers, Globe, Bot, BarChart3 } from 'lucide-react';

export type RightPanelType = 'files' | 'search' | 'git' | 'terminal' | 'context' | 'user-browser' | 'browser' | 'usage';

interface RightActivityBarProps {
  activePanel: RightPanelType;
  onChangePanel: (panel: RightPanelType) => void;
  isPanelOpen: boolean;
}

export function RightActivityBar({ activePanel, onChangePanel, isPanelOpen }: RightActivityBarProps) {
  const getBtnClass = (panel: RightPanelType) => {
    const base = "relative w-full h-10 flex items-center justify-center transition-colors border-l-2";
    const isActive = isPanelOpen && activePanel === panel;
    return `${base} ${isActive ? 'text-ink border-ink bg-ink/5' : 'text-ink/40 border-transparent hover:text-ink hover:bg-ink/5'}`;
  };

  return (
    <nav className="w-12 flex-shrink-0 border-l border-ink/10 bg-paper flex flex-col items-center py-3 space-y-2 z-10">
      {/* Top Icons */}
      <div className="flex flex-col items-center space-y-1 w-full">
        <button
          className={getBtnClass('context')}
          onClick={() => onChangePanel('context')}
          title="Context & Telemetry"
        >
          <Layers size={16} />
        </button>
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
        <button
          className={getBtnClass('user-browser')}
          onClick={() => onChangePanel('user-browser')}
          title="Browser (Anda)"
        >
          <Globe size={16} />
        </button>
        <button
          className={getBtnClass('browser')}
          onClick={() => onChangePanel('browser')}
          title="Browser Agent"
        >
          <Bot size={16} />
        </button>
        <button
          className={getBtnClass('usage')}
          onClick={() => onChangePanel('usage')}
          title="Usage"
        >
          <BarChart3 size={16} />
        </button>
      </div>
      
      <div className="flex-1" />
    </nav>
  );
}
