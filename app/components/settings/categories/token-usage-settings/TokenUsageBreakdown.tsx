import React from 'react';
import type { BreakdownTab, BreakdownRow, TokenUsageMetricSet } from '@/types';

interface TokenUsageBreakdownProps {
  breakdownTab: BreakdownTab;
  setBreakdownTab: (tab: BreakdownTab) => void;
  activeBreakdownRows: BreakdownRow[];
  activeMetrics: TokenUsageMetricSet;
}

export function TokenUsageBreakdown({
  breakdownTab,
  setBreakdownTab,
  activeBreakdownRows,
  activeMetrics,
}: TokenUsageBreakdownProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      {/* Breakdown Table with Active Tabs */}
      <div className="bg-paper border border-ink/15 rounded-lg p-3.5 shadow-xs xl:col-span-2">
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-xs text-ink">Breakdown</span>
          <div className="flex bg-ink/5 rounded p-0.5">
            <button
              onClick={() => setBreakdownTab('model')}
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider transition-colors ${
                breakdownTab === 'model' ? 'bg-paper shadow-xs text-ink' : 'text-ink/50 hover:text-ink'
              }`}
            >
              MODEL
            </button>
            <button
              onClick={() => setBreakdownTab('day')}
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider transition-colors ${
                breakdownTab === 'day' ? 'bg-paper shadow-xs text-ink' : 'text-ink/50 hover:text-ink'
              }`}
            >
              DAY
            </button>
            <button
              onClick={() => setBreakdownTab('project')}
              className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider transition-colors ${
                breakdownTab === 'project' ? 'bg-paper shadow-xs text-ink' : 'text-ink/50 hover:text-ink'
              }`}
            >
              PROJECT
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-ink/40 border-b border-ink/10">
                <th className="font-medium text-left pb-2 capitalize">{breakdownTab}</th>
                <th className="font-medium text-right pb-2">Cost</th>
                <th className="font-medium text-right pb-2">Share</th>
                <th className="font-medium text-right pb-2">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {activeBreakdownRows.map((row) => (
                <tr key={row.name}>
                  <td className="py-2.5 flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${row.dotColorClass}`}></div>
                    <span className="font-semibold text-ink whitespace-nowrap">{row.name}</span>
                  </td>
                  <td className="py-2.5 text-right font-bold text-ink">{row.cost}</td>
                  <td className="py-2.5 text-right text-ink/60">{row.share}</td>
                  <td className="py-2.5 text-right text-ink/60">{row.tokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Dynamic Stacked Share Bar */}
        <div className="h-1.5 w-full bg-ink/5 rounded-full mt-3 overflow-hidden flex">
          {activeBreakdownRows.map((row, idx) => (
            <div
              key={row.name}
              className={`h-full ${
                idx === 0 ? 'bg-ink/80' : idx === 1 ? 'bg-ink/45 border-l border-paper' : 'bg-ink/20 border-l border-paper'
              }`}
              style={{ width: `${row.sharePercent}%` }}
            ></div>
          ))}
        </div>
      </div>

      {/* Cost quality */}
      <div className="bg-paper border border-ink/15 rounded-lg p-3.5 shadow-xs xl:col-span-1">
        <div className="font-semibold text-xs mb-3 text-ink">Cost quality</div>
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-ink/60">Provider reported</span>
            <span className="font-semibold text-ink">100.0%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-ink/60">Model priced</span>
            <span className="font-semibold text-ink">0.0%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-ink/60">Unpriced</span>
            <span className="font-semibold text-ink">0.0%</span>
          </div>
        </div>

        <div className="border-t border-ink/10 mt-3 pt-2.5">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-ink/60">Cache savings</span>
            <span className="font-semibold text-ink">{activeMetrics.cacheSavings}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
