import React from 'react';

interface MinimapShortcutsProps {
  userMessages: any[];
  onScrollTo: (id: string) => void;
}

export function MinimapShortcuts({ userMessages, onScrollTo }: MinimapShortcutsProps) {
  if (userMessages.length === 0) return null;

  return (
    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 py-8 pl-12 group pointer-events-auto">
      <div className="flex flex-col items-center space-y-3 p-2 bg-[#faf8f3]/90 backdrop-blur rounded-full border border-[#141310]/10 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {userMessages.map((msg, idx) => (
          <div key={`minimap-${msg.id}`} className="relative group/dot flex items-center justify-center">
            <button 
              onClick={() => onScrollTo(msg.id)}
              className="w-2 h-2 rounded-full bg-[#141310]/30 group-hover/dot:bg-[#141310] group-hover/dot:scale-125 transition-all"
              aria-label={`Jump to your message #${idx + 1}`}
            />
            <div className="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 w-64 p-3 bg-[#141310] text-[#f4f1ea] text-xs rounded-md shadow-lg opacity-0 pointer-events-none group-hover/dot:opacity-100 transition-opacity duration-200 z-30">
              <div className="line-clamp-3 whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              <div className="absolute top-1/2 -right-1 transform -translate-y-1/2 w-2 h-2 bg-[#141310] rotate-45"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
