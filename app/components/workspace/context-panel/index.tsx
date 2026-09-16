import { useEffect, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { SessionContextTelemetry } from '@/types';
import { emptyTelemetry } from '@/data/context-data';
import { ContextWindowCard } from '@/components/workspace/context-panel/WindowCard';
import { ContextStatsGrid } from '@/components/workspace/context-panel/StatsGrid';
import { LastMessageCard } from '@/components/workspace/context-panel/LastMessageCard';
import { TokenDistributionBar } from '@/components/workspace/context-panel/TokenDistributionBar';
import { RawMessagesList } from '@/components/workspace/context-panel/RawMessagesList';
import { useScrollbarFade } from '@/hooks/ui/scrollbar-fade';
import { useAgentProcessing } from '@/hooks/chat/omp/processing';

// Poll cadence while the agent is streaming — telemetry (context usage, token
// cost) advances per assistant turn, not per frame, so 2s is plenty.
const STREAM_POLL_MS = 2000;

interface ContextPanelProps {
  className?: string;
  enabled?: boolean;
  refreshKey?: number;
  onClose?: () => void;
}

export function ContextPanel({
  className = '',
  enabled = true,
  refreshKey = 0
}: ContextPanelProps) {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const { isScrolling, handleScroll } = useScrollbarFade();
  const isProcessing = useAgentProcessing(sessionId);

  const [telemetry, setTelemetry] = useState<SessionContextTelemetry>(() =>
    emptyTelemetry(sessionId || 'default', 'Session not started')
  );

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let cancelled = false;
    const param = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';

    const loadTelemetry = () => {
      fetch(`/api/telemetry/context${param}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data && data.telemetry) {
            setTelemetry(data.telemetry);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('Failed to fetch context telemetry:', err);
          }
        });
    };

    loadTelemetry();

    // Live refresh: while the session streams, telemetry (context usage,
    // tokens, cost) advances per assistant turn — re-read on a short cadence
    // so the panel tracks the stream without the user switching panels.
    if (!isProcessing) return () => { cancelled = true; };
    const timer = window.setInterval(loadTelemetry, STREAM_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, refreshKey, enabled, isProcessing]);

  if (!enabled) {
    return (
      <div className={`flex flex-col h-full bg-paper items-center justify-center text-ink/40 ${className}`}>
        <span className="text-xs font-mono">No session selected</span>
      </div>
    );
  }

  if (telemetry.messagesCount === 0) {
    return (
      <div className={`flex flex-col h-full bg-paper items-center justify-center text-ink/40 ${className}`}>
        <span className="text-xs font-mono">Session not started</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-paper text-ink overflow-hidden select-none ${className}`}>
      {/* Top Header without action buttons */}
      <div className="flex-shrink-0 p-4 border-b border-ink/10 bg-paper">
        <div>
          <h2 className="text-xs font-medium text-ink tracking-tight truncate">
            {telemetry.sessionTitle}
          </h2>
          <div className="text-[11px] text-ink/50 mt-1 truncate font-mono">
            {telemetry.timestamp}
          </div>
        </div>
      </div>

      {/* Scrollable Context Body */}
      <div onScroll={handleScroll} className={`flex-1 scrollbar-overlay-container p-4 space-y-4 ${isScrolling ? 'scrollbar-overlay-scrolling' : 'scrollbar-overlay'}`}>
        {/* 1. Context Window Usage Progress Card */}
        <ContextWindowCard
          used={telemetry.contextUsed}
          limit={telemetry.contextLimit}
          percent={telemetry.contextPercent}
        />

        {/* 2. Metric Row (Messages, User, Assistant, Cache Hit, Cost + detail) */}
        <ContextStatsGrid
          messagesCount={telemetry.messagesCount}
          userCount={telemetry.userCount}
          assistantCount={telemetry.assistantCount}
          costFormatted={telemetry.costFormatted}
          cacheHitAverage={telemetry.cacheHitAverage}
          costBreakdown={telemetry.costBreakdown}
        />

        {/* 3. Last Assistant Message Stats */}
        <LastMessageCard
          input={telemetry.lastMessage.input}
          output={telemetry.lastMessage.output}
          reasoning={telemetry.lastMessage.reasoning}
          cacheRead={telemetry.lastMessage.cacheRead}
          cacheWrite={telemetry.lastMessage.cacheWrite}
          cacheHitPercent={telemetry.lastMessage.cacheHitPercent}
        />

        {/* 4. Token Distribution Segmented Bar */}
        <TokenDistributionBar
          userPercent={telemetry.distribution.userPercent}
          assistantPercent={telemetry.distribution.assistantPercent}
          toolPercent={telemetry.distribution.toolPercent}
          otherPercent={telemetry.distribution.otherPercent}
        />

        {/* 5. Raw Messages List */}
        <RawMessagesList items={telemetry.rawMessages} />
      </div>
    </div>
  );
}
