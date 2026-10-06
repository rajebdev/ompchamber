import { Plus } from 'lucide-preact';
import { StreamStatusDot } from '@/client/components/common/StreamStatusDot';
import type { AgentStreamStatus } from '@/shared/lib/chat/omp/status';

export function SessionSidebarHeader({ onNewSession, streamStatus }: { onNewSession: () => void; streamStatus?: AgentStreamStatus }) {
  return (
    <>
      {/* App Title */}
      <div 
        className="h-10 flex-shrink-0 flex items-center px-4 border-b border-ink/10 titlebar-drag-region select-none"
        style={{ paddingLeft: 'max(1rem, env(titlebar-area-x, 0px))' }}
      >
        {/* The stream indicator badges the wordmark's top-right corner, the
            same placement the phone's header uses — it reads as part of the
            title instead of competing with the icon controls for a slot. */}
        <span className="relative font-bold text-sm tracking-tight flex items-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[15px] tracking-tighter">OMP</span>
          <span className="ml-[1px]">Chamber</span>
          <span className="absolute -top-0.5 -right-1.5 flex">
            <StreamStatusDot status={streamStatus} />
          </span>
        </span>
      </div>

      {/* New Session Button */}
      <div className="px-3 pt-3 titlebar-no-drag">
        <button 
          onClick={onNewSession}
          className="w-full flex items-center justify-center space-x-2 py-2 bg-ink text-canvas rounded text-xs font-semibold hover:bg-ink/90 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          <span>New Session</span>
        </button>
      </div>
    </>
  );
}
