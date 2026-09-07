import React, { useEffect, useState } from 'react';
import { useSearchParams } from '@remix-run/react';
import { Layers } from 'lucide-react';
import type { SessionContextTelemetry } from '@/types';
import { getDefaultMockTelemetry } from '@/data/contextData';
import { ContextWindowCard } from './context-panel/ContextWindowCard';
import { ContextStatsGrid } from './context-panel/ContextStatsGrid';
import { LastMessageCard } from './context-panel/LastMessageCard';
import { TokenDistributionBar } from './context-panel/TokenDistributionBar';
import { RawMessagesList } from './context-panel/RawMessagesList';

interface ContextPanelProps {
  className?: string;
  refreshKey?: number;
  onClose?: () => void;
}

export function ContextPanel({
  className = '',
  refreshKey = 0
}: ContextPanelProps) {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [telemetry, setTelemetry] = useState<SessionContextTelemetry>(() =>
    getDefaultMockTelemetry(sessionId || 'history-commit', 'History Commit 2026-09-06 23:00')
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
    fetchContextTelemetry();
  }, [sessionId, refreshKey]);

  return (
    <div className={`flex flex-col h-full bg-paper text-ink overflow-hidden select-none ${className}`}>
      {/* Top Header without action buttons */}
      <div className="flex-shrink-0 p-4 border-b border-ink/10 bg-paper">
        <div>
          <h2 className="text-sm font-semibold text-ink tracking-tight truncate flex items-center gap-1.5">
            <span className="truncate">{telemetry.sessionTitle}</span>
          </h2>
          <div className="text-[11px] text-ink/50 mt-1 truncate font-mono">
            Command Code / [CMD] {telemetry.modelName} · {telemetry.timestamp}
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

        {/* 2. Metric Grid (Messages, User, Assistant, Cost) */}
        <ContextStatsGrid
          messagesCount={telemetry.messagesCount}
          userCount={telemetry.userCount}
          assistantCount={telemetry.assistantCount}
          costFormatted={telemetry.costFormatted}
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
