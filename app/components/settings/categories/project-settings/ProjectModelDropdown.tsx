import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown, Info, Check } from 'lucide-react';
import { AVAILABLE_PROJECT_MODELS } from '@/data/projectData';

interface ProjectModelDropdownProps {
  model: string;
  onSelectModel: (model: string) => void;
}

export function ProjectModelDropdown({
  model,
  onSelectModel,
}: ProjectModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 relative">
        <h4 className="text-xs font-semibold text-ink">
          Defaults for new chats
        </h4>
        <div
          className="relative inline-block cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Info size={12} className="text-ink/40 hover:text-ink/70 transition-colors" />
          {showTooltip && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-ink text-canvas text-[10px] rounded px-2 py-1 shadow-lg whitespace-nowrap z-50 pointer-events-none">
              Default model assigned when starting new sessions in this project
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 p-3 bg-paper border border-ink/15 rounded-lg">
        <div>
          <div className="text-xs font-medium text-ink">Project Model</div>
          <div className="text-[11px] text-ink/50">Fallback model for agent sessions</div>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-ink/20 hover:border-ink/40 bg-paper text-ink text-xs font-medium transition-colors cursor-pointer shadow-2xs"
          >
            <Sparkles size={13} className="text-ink/70" />
            <span>{model || 'Not selected'}</span>
            <ChevronDown size={13} className="text-ink/50 ml-1" />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-paper border border-ink/15 rounded-lg shadow-xl py-1 z-50 max-h-56 overflow-y-auto">
              {AVAILABLE_PROJECT_MODELS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    onSelectModel(item);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-ink/5 transition-colors cursor-pointer"
                >
                  <span className={item === model ? 'font-semibold text-ink' : 'text-ink/80'}>
                    {item}
                  </span>
                  {item === model && <Check size={13} className="text-ink" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
