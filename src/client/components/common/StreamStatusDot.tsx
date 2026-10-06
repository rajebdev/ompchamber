import type { AgentStreamStatus } from '@/shared/lib/chat/omp/status';

interface StreamStatusDotProps {
  /** Live realtime-channel status; absent until a consumer mounts. */
  status?: AgentStreamStatus;
}

/**
 * Realtime-channel connection indicator: green while the shared socket is
 * attached, red once it drops. Textless by design; `title`/`aria-label` carry
 * the state for hover and screen readers.
 */
export function StreamStatusDot({ status }: StreamStatusDotProps) {
  if (!status) return null;
  const connected = status.connected;
  const label = connected ? 'Realtime channel connected' : 'Realtime channel disconnected';
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="flex items-center flex-shrink-0 select-none"
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-success' : 'bg-error'}`} />
    </span>
  );
}
