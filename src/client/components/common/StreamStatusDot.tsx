import type { AgentStreamStatus } from '@/shared/lib/chat/omp/status';

interface StreamStatusDotProps {
  /** Live agent event stream status; absent until the chat timeline mounts. */
  status?: AgentStreamStatus;
  /**
   * Render a short text label beside the dot. Touch UIs (the mobile layout)
   * have no hover title, so a bare dot would be unreadable there.
   */
  showLabel?: boolean;
}

/**
 * Live agent-stream connection indicator: green while the transport is
 * attached, red once it drops. Rendered for the WebSocket transport only —
 * the SSE fallback publishes no live status to report.
 */
export function StreamStatusDot({ status, showLabel = false }: StreamStatusDotProps) {
  if (status?.transport !== 'websocket') return null;
  const connected = Boolean(status.connected);
  const label = connected ? 'WebSocket connected' : 'WebSocket disconnected';
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="flex items-center gap-1.5 flex-shrink-0 select-none"
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-success' : 'bg-error'}`} />
      {showLabel && (
        <span className={`text-[10px] font-medium ${connected ? 'text-ink/60' : 'text-error'}`}>
          {connected ? 'Connected' : 'Offline'}
        </span>
      )}
    </span>
  );
}
