interface StatCardProps {
  /** Primary metric shown first (or the compact tile's value). */
  value: string | number;
  /** Tile caption. */
  label: string;
  /** Optional secondary line under the caption (metric variant only). */
  hint?: string;
  /** Muted surface for a de-emphasised tile (metric variant only). */
  tone?: 'default' | 'muted';
  /**
   * `metric` — the large value-first tile used by usage/token grids.
   * `compact` — the dense label-first chip used by the context panel.
   */
  variant?: 'metric' | 'compact';
  /** Extra classes on the tile root (e.g. grid span). */
  className?: string;
}

/**
 * Shared stat tile. Two shapes are supported so every existing call site keeps
 * its exact markup: the value-first `metric` tile and the dense `compact` chip.
 */
export function StatCard({
  value,
  label,
  hint,
  tone = 'default',
  variant = 'metric',
  className = '',
}: StatCardProps) {
  if (variant === 'compact') {
    return (
      <div className="bg-canvas border border-ink/10 rounded-lg px-2.5 py-1.5 flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[10px] font-medium text-ink/50">{label}</span>
        <span className="text-xs font-semibold font-mono text-ink truncate">{value}</span>
      </div>
    );
  }

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
