import { useEffect, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { SessionContextTelemetry } from '@/types';
import { emptyTelemetry } from '@/data/contextData';
import { ContextWindowCard } from '@/components/workspace/context-panel/ContextWindowCard';
import { ContextStatsGrid } from '@/components/workspace/context-panel/ContextStatsGrid';
import { LastMessageCard } from '@/components/workspace/context-panel/LastMessageCard';
import { TokenDistributionBar } from '@/components/workspace/context-panel/TokenDistributionBar';
import { RawMessagesList } from '@/components/workspace/context-panel/RawMessagesList';

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

  const [telemetry, setTelemetry] = useState<SessionContextTelemetry>(() =>
    emptyTelemetry(sessionId || 'default', 'Session not started')
  );

  const fetchContextTelemetry = () => {
    const param = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    fetch(`/api/telemetry/context${param}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.telemetry) {
          setTelemetry(data.telemetry);
        }
      })
      .catch(err => {
        console.error('Failed to fetch context telemetry:', err);
      });
  };

  useEffect(() => {
    if (!enabled) return;
    fetchContextTelemetry();
  }, [sessionId, refreshKey, enabled]);

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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
