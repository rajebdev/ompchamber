import { Ban, CheckCircle2, Circle, CircleAlert } from 'lucide-preact';
import type { SubagentInfo } from '@/shared/types';

interface SubagentStatusIconProps {
  status: SubagentInfo['status'];
  live?: boolean;
  size?: number;
}

/** Shared subagent status glyph: terminal states are static, an actively
 *  running agent pulses, and a stale/history "started" entry is a hollow
 *  circle (`live === false`). */
export function SubagentStatusIcon({ status, live, size = 12 }: SubagentStatusIconProps) {
  const iconProps = { size, strokeWidth: 2, 'aria-hidden': true as const };
  if (status === 'completed') return <CheckCircle2 {...iconProps} className="text-success" />;
  if (status === 'failed') return <CircleAlert {...iconProps} className="text-error" />;
  if (status === 'aborted') return <Ban {...iconProps} className="text-ink/40" />;
  if (live === false) return <Circle {...iconProps} className="text-ink/30" />;
  const dot = Math.max(5, Math.round(size / 2));
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 animate-pulse rounded-full bg-success"
      style={{ width: dot, height: dot }}
    />
  );
}
