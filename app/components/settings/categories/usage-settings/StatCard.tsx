interface StatCardProps {
  value: string;
  label: string;
  hint?: string;
  tone?: 'default' | 'muted';
  className?: string;
}

/** Stat tile matching the token-usage metrics grid visual language. */
export function StatCard({ value, label, hint, tone = 'default', className = '' }: StatCardProps) {
  const shell = tone === 'muted' ? 'bg-ink/5 border-ink/10' : 'bg-paper border-ink/15';
  return (
    <div className={`${shell} border rounded-lg p-3 shadow-xs flex flex-col justify-between h-full min-w-0 ${className}`}>
      <div className="min-w-0">
        <div className="text-base font-bold tracking-tight text-ink leading-tight tabular-nums break-normal">{value}</div>
        <div className="text-[11px] font-semibold text-ink/75 mt-1.5 leading-snug min-h-[30px] flex items-start">
          <span className="min-w-0 break-normal">{label}</span>
        </div>
      </div>
      {hint && <div className="text-[10px] text-ink/50 mt-1.5 leading-tight break-words">{hint}</div>}
    </div>
  );
}
