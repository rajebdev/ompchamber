import { X } from 'lucide-react';
import packageJson from '@/../package.json';
import type { UseUpdatesResult } from '@/hooks/ui/updates';
import { SocialLinks } from '@/components/layout/session-sidebar/about-modal/SocialLinks';
import { UpdateSection } from '@/components/layout/session-sidebar/about-modal/UpdateSection';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  updates: UseUpdatesResult;
  onToast?: (message: string, type?: 'success' | 'error') => void;
}

export function AboutModal({ isOpen, onClose, updates, onToast }: AboutModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-paper border border-ink/15 rounded-2xl shadow-2xl w-full max-w-[340px] p-6 text-center text-ink select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink/40 hover:text-ink transition-colors p-1 rounded-md"
          aria-label="Close"
        >
          <X size={18} className="stroke-[2.5]" />
        </button>

        {/* OMP Chamber Brand Logo */}
        <div className="flex justify-center pt-2 pb-1">
          <img src="/icon.svg" alt="OMPChamber" width={96} height={96} draggable={false} />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold tracking-tight mt-3 flex items-center justify-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 font-extrabold text-2xl tracking-tighter">OMP</span>
          <span className="text-ink text-2xl font-bold ml-[1px]">Chamber</span>
        </h2>

        {/* App & Agent Versions */}
        <div className="text-xs text-ink/60 space-y-1 mt-1.5 font-mono">
          <p>OMPChamber v{packageJson.version}</p>
          <p>Oh-My-Pi {updates.info?.omp.current ?? '…'}</p>
        </div>

        <UpdateSection updates={updates} onToast={onToast} />

        <SocialLinks />

        {/* Footer */}
        <p className="text-[11px] text-ink/50 font-normal mt-8">
          Made with love for the community
        </p>
      </div>
    </div>
  );
}
