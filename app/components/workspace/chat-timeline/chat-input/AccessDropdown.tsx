import { useState, useRef } from 'react';
import { LockKeyhole, Check } from 'lucide-react';
import { useOnClickOutside } from '@/hooks/ui/on-click-outside';

const ACCESS_LEVELS = ['Full bypass', 'Minimal', 'Always ask'];

export function AccessDropdown() {
  const [showAccess, setShowAccess] = useState(false);
  const [selectedAccess, setSelectedAccess] = useState('Always ask');
  const accessRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(accessRef, () => setShowAccess(false));

  return (
    <div className="relative" ref={accessRef}>
      <button
        onClick={() => setShowAccess(!showAccess)}
        className="flex items-center space-x-1 hover:bg-ink/5 px-2 py-1 rounded transition-colors text-xs text-ink/80"
      >
        <LockKeyhole size={12} className="text-ink/60" />
        <span className="hidden lg:inline">{selectedAccess}</span>
      </button>
      {showAccess && (
        <div className="absolute bottom-full left-0 mb-1 w-40 bg-paper border border-ink/20 rounded-md shadow-lg z-50 py-1 text-xs">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink/40 font-semibold mb-1">Access Control</div>
          {ACCESS_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => { setSelectedAccess(level); setShowAccess(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center justify-between transition-colors"
            >
              <span>{level}</span>
              {selectedAccess === level && <Check size={12} className="text-ink" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
