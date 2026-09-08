import React, { useState } from 'react';

interface MinimapShortcutsProps {
  userMessages: any[];
  onScrollTo: (id: string) => void;
}

export function MinimapShortcuts({ userMessages, onScrollTo }: MinimapShortcutsProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (userMessages.length === 0) return null;

  const lineWidth = (idx: number): string => {
    if (hoveredIdx === null) return 'w-3';
    const dist = Math.abs(idx - hoveredIdx);
    if (dist === 0) return 'w-6';
    if (dist === 1) return 'w-4';
    return 'w-3';
  };

  return (
    <div
      className="absolute right-0.5 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center py-4 w-6"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {userMessages.map((msg, idx) => {
        const isHovered = hoveredIdx === idx;
        return (
          <div
            key={`minimap-${msg.id}`}
            className="relative flex items-center justify-center w-full py-[3px] cursor-pointer"
            onMouseEnter={() => setHoveredIdx(idx)}
            onClick={() => onScrollTo(msg.id)}
          >
            <button
              className={`block h-px rounded-full transition-all duration-200 ease-out ${lineWidth(idx)} ${isHovered ? 'bg-ink h-[2px]' : 'bg-ink/25'}`}
              aria-label={`Jump to your message #${idx + 1}`}
            />
            <div className={`absolute right-full mr-3 top-1/2 transform -translate-y-1/2 w-64 p-3 bg-ink text-canvas text-xs rounded-md shadow-lg pointer-events-none transition-opacity duration-200 z-30 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
              <div className="line-clamp-3 whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              <div className="absolute top-1/2 -right-1 transform -translate-y-1/2 w-2 h-2 bg-ink rotate-45"></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
