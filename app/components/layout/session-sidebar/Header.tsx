import { Plus } from 'lucide-react';

export function SessionSidebarHeader({ onNewSession }: { onNewSession: () => void }) {
  return (
    <>
      {/* App Title */}
      <div className="h-12 flex-shrink-0 flex items-center px-4 border-b border-ink/10">
        <span className="font-bold text-sm tracking-tight flex items-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[15px] tracking-tighter">OMP</span>
          <span className="ml-[1px]">Chamber</span>
        </span>
      </div>

      {/* New Session Button */}
      <div className="px-3 pt-3">
        <button 
          onClick={onNewSession}
          className="w-full flex items-center justify-center space-x-2 py-2 bg-ink text-canvas rounded text-xs font-semibold hover:bg-ink/90 transition-colors"
        >
          <Plus size={14} />
          <span>New Session</span>
        </button>
      </div>
    </>
  );
}
