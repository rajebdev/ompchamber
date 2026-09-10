import { X } from 'lucide-react';

export function MobileSessionHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="h-14 border-b border-ink/10 flex items-center justify-between px-3.5 flex-shrink-0 bg-canvas">
      <div className="flex items-center space-x-2.5">
        <span className="font-bold text-sm tracking-tight flex items-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-[16px] tracking-tighter">OMP</span>
          <span className="ml-[1px] text-ink font-bold text-sm">Chamber</span>
        </span>
        <span className="text-ink/25 text-xs select-none">/</span>
        <span className="text-[11px] font-semibold text-ink/60 uppercase tracking-wider font-mono">Sessions</span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-9 h-9 rounded-xl hover:bg-ink/5 active:bg-ink/10 text-ink flex items-center justify-center transition-colors cursor-pointer"
        title="Close sidebar"
        aria-label="Close sidebar"
      >
        <X size={19} strokeWidth={2} />
      </button>
    </div>
  );
}
