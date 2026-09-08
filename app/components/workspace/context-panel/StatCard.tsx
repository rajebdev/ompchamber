import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-canvas border border-ink/10 rounded-lg px-2.5 py-1.5 flex flex-col gap-0.5 flex-1 min-w-0">
      <span className="text-[10px] font-medium text-ink/50">{label}</span>
      <span className="text-xs font-semibold font-mono text-ink truncate">{value}</span>
    </div>
  );
}
