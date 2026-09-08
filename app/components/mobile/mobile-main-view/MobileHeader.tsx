import { useState, useRef } from 'react';
import { 
  Menu, 
  ChevronDown, 
  PanelRight, 
  Check, 
  Plus
} from 'lucide-react';
import type { WorkspaceFolderData } from '@/types';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

interface MobileHeaderProps {
  activeSessionTitle: string;
  activeSessionId: number | string | null;
  folders: WorkspaceFolderData[];
  onOpenSessionSidebar: () => void;
  onOpenRightSidebar: () => void;
  onNewSession: () => void;
  onSelectSession: (id: number | string) => void;
}

export function MobileHeader({
  activeSessionTitle,
  activeSessionId,
  folders,
  onOpenSessionSidebar,
  onOpenRightSidebar,
  onNewSession,
  onSelectSession
}: MobileHeaderProps) {
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(false);

  const sessionPickerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(sessionPickerRef, () => setShowSessionPicker(false));

  const telemetryRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(telemetryRef, () => setShowTelemetry(false));

  return (
    <header className="h-14 flex-shrink-0 bg-canvas border-b border-ink/10 flex items-center justify-between px-3 z-20">
      
      {/* Left: Hamburger button, App Title & Session Dropdown */}
      <div className="flex items-center space-x-2 min-w-0">
        <button
          type="button"
          onClick={onOpenSessionSidebar}
          className="p-1.5 rounded-lg hover:bg-ink/5 active:bg-ink/10 text-ink transition-colors flex-shrink-0"
          title="Open Sessions"
          aria-label="Open Sessions"
        >
          <Menu size={20} strokeWidth={2} />
        </button>

        {/* App Title */}
        <span className="font-bold text-sm tracking-tight flex items-center flex-shrink-0">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[15px] tracking-tighter">OMP</span>
          <span className="ml-[1px] text-ink">Chamber</span>
        </span>

        <span className="text-ink/25 font-light text-xs flex-shrink-0 select-none">/</span>

        <div className="relative min-w-0" ref={sessionPickerRef}>
          <button
            type="button"
            onClick={() => setShowSessionPicker(!showSessionPicker)}
            className="flex items-center space-x-1 text-xs font-semibold text-ink hover:text-ink/80 transition-colors py-1 truncate max-w-[130px]"
          >
            <span className="truncate">{activeSessionTitle}</span>
            <ChevronDown size={13} className="text-ink/50 flex-shrink-0" />
          </button>

          {showSessionPicker && (
            <div className="absolute top-full left-0 mt-1.5 w-64 bg-paper border border-ink/15 rounded-xl shadow-lg z-50 p-2 text-xs">
              <button
                type="button"
                onClick={() => { onNewSession(); setShowSessionPicker(false); }}
                className="w-full text-left px-3 py-2 rounded-lg bg-ink text-canvas flex items-center space-x-2 font-medium mb-1.5 active:scale-98"
              >
                <Plus size={14} />
                <span>Start New Session</span>
              </button>

              <div className="px-2 py-1 text-[10px] uppercase font-bold text-ink/40">Recent Sessions</div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {folders.flatMap(f => f.sessions || []).slice(0, 10).map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onSelectSession(s.id); setShowSessionPicker(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${activeSessionId === s.id ? 'bg-ink/10 font-semibold text-ink' : 'hover:bg-ink/5 text-ink/80'}`}
                  >
                    <span className="truncate">{s.title}</span>
                    {activeSessionId === s.id && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side: Status Indicator (○) & Right Sidebar Button (🔀) */}
      <div className="flex items-center space-x-1 text-ink">
        {/* Telemetry Status Indicator (○) */}
        <div className="relative flex items-center" ref={telemetryRef}>
          <button
            type="button"
            onClick={() => setShowTelemetry(!showTelemetry)}
            className="w-8 h-8 rounded-lg hover:bg-ink/5 active:bg-ink/10 flex items-center justify-center text-ink transition-colors cursor-pointer"
            title="System Telemetry"
            aria-label="System Telemetry"
          >
            <span className="w-4 h-4 rounded-full border-[1.5px] border-ink/60 hover:border-ink transition-colors" />
          </button>
          {showTelemetry && (
            <div className="absolute top-full right-0 mt-2 w-52 bg-paper border border-ink/20 rounded-xl shadow-xl z-50 p-3 text-xs font-mono">
              <div className="font-semibold text-ink font-sans pb-1.5 border-b border-ink/10 flex items-center justify-between">
                <span>Runtime Diagnostics</span>
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              </div>
              <div className="pt-2 space-y-1.5 text-[11px] text-ink/80">
                <div className="flex justify-between">
                  <span className="text-ink/50">Runtime:</span>
                  <span>Bun v1.2.4</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/50">CPU Load:</span>
                  <span>6.4%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/50">Memory:</span>
                  <span>90%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/50">CI/CD:</span>
                  <span className="text-success">Ready</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar / Activity Panel Toggle */}
        <button
          type="button"
          onClick={onOpenRightSidebar}
          className="w-8 h-8 rounded-lg hover:bg-ink/5 active:bg-ink/10 flex items-center justify-center text-ink transition-colors cursor-pointer"
          title="Right Panel"
          aria-label="Open Right Panel"
        >
          <PanelRight size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
