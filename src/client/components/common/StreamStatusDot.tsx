import type { AgentStreamStatus } from '@/shared/lib/chat/omp/status';

interface StreamStatusDotProps {
  /** Live agent event stream status; absent until the chat timeline mounts. */
  status?: AgentStreamStatus;
}

/**
 * Live agent-stream connection indicator: green while the transport is
 * attached, red once it drops. Rendered for the WebSocket transport only —
 * the SSE fallback publishes no live status to report. Textless by design;
 * `title`/`aria-label` carry the state for hover and screen readers.
 */
export function StreamStatusDot({ status }: StreamStatusDotProps) {
  if (status?.transport !== 'websocket') return null;
  const connected = Boolean(status.connected);
  const label = connected ? 'WebSocket connected' : 'WebSocket disconnected';
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
