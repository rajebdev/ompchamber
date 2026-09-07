import React from 'react';

interface ContextStatsGridProps {
  messagesCount: number;
  userCount: number;
  assistantCount: number;
  costFormatted: string;
}

export function ContextStatsGrid({
  messagesCount,
  userCount,
  assistantCount,
  costFormatted
}: ContextStatsGridProps) {
  const stats = [
    { label: 'Messages', value: messagesCount },
    { label: 'User', value: userCount },
    { label: 'Assistant', value: assistantCount },
    { label: 'Cost', value: costFormatted }
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {stats.map((item) => (
        <div
          key={item.label}
          className="bg-canvas border border-ink/10 rounded-xl p-3.5 flex flex-col justify-between"
        >
          <span className="text-[11px] font-medium text-ink/60 mb-1.5">{item.label}</span>
          <span className="text-base font-semibold font-mono text-ink tracking-tight">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
