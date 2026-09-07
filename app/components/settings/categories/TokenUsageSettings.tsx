import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronDown, Check } from 'lucide-react';
import type {
  SettingsState,
  CadenceType,
  TimeRangeType,
  BreakdownTab,
  ChartMetric,
} from '@/types';
import { TokenUsageMetricsGrid } from './token-usage-settings/TokenUsageMetricsGrid';
import { TokenUsageBreakdown } from './token-usage-settings/TokenUsageBreakdown';

interface TokenUsageSettingsProps {
  settings: SettingsState;
  onUpdate: (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => void;
}

export function TokenUsageSettings({ settings: _settings, onUpdate: _onUpdate }: TokenUsageSettingsProps) {
  const [cadence, setCadence] = useState<CadenceType>('daily');
  const [timeRange, setTimeRange] = useState<TimeRangeType>('30d');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('cost');
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>('model');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [timeRanges, setTimeRanges] = useState<any[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<any>(null);
  const [activeBreakdownRows, setActiveBreakdownRows] = useState<any[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = useCallback(() => {
    setIsRefreshing(true);
    fetch(`/api/telemetry/tokens?timeRange=${timeRange}&breakdownTab=${breakdownTab}`)
      .then(res => res.json())
      .then(data => {
        if (data.timeRanges) setTimeRanges(data.timeRanges);
        if (data.metrics) setActiveMetrics(data.metrics);
        if (data.breakdownRows) setActiveBreakdownRows(data.breakdownRows);
      })
      .catch(err => console.error('Failed to load token telemetry:', err))
      .finally(() => setIsRefreshing(false));
  }, [timeRange, breakdownTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData();
  };

  const selectedRangeObj = timeRanges.find((r) => r.id === timeRange) || timeRanges[0] || { id: timeRange, label: timeRange, dateRange: 'Current Period' };

  if (!activeMetrics) {
    return (
      <div className="flex items-center justify-center p-8 text-ink/40 text-xs">
        Loading token usage telemetry...
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 text-ink pb-2 text-xs">
      {/* Filter and Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink/75">{selectedRangeObj.dateRange}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Cadence Switcher: Daily -> Weekly -> Monthly */}
          <div className="flex items-center bg-paper border border-ink/15 rounded-md text-[11px] font-medium overflow-hidden">
            <button
              onClick={() => setCadence('daily')}
              className={`px-2.5 py-1 transition-colors ${
                cadence === 'daily' ? 'bg-ink/10 text-ink font-semibold' : 'text-ink/65 hover:bg-ink/5 hover:text-ink'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setCadence('weekly')}
              className={`px-2.5 py-1 transition-colors ${
                cadence === 'weekly' ? 'bg-ink/10 text-ink font-semibold' : 'text-ink/65 hover:bg-ink/5 hover:text-ink'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setCadence('monthly')}
              className={`px-2.5 py-1 transition-colors ${
                cadence === 'monthly' ? 'bg-ink/10 text-ink font-semibold' : 'text-ink/65 hover:bg-ink/5 hover:text-ink'
              }`}
            >
              Monthly
            </button>
          </div>

          {/* Time Range Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-paper border border-ink/15 rounded-md text-[11px] font-medium hover:bg-ink/5 text-ink/80 transition-colors"
            >
              <span>{selectedRangeObj.label}</span>
              <ChevronDown size={12} className={`transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-paper border border-ink/15 rounded-md shadow-lg z-30 py-1 text-[11px] divide-y divide-ink/5">
                {timeRanges.map((range) => (
                  <button
                    key={range.id}
                    onClick={() => {
                      setTimeRange(range.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-ink/5 transition-colors ${
                      timeRange === range.id ? 'font-semibold text-ink bg-ink/5' : 'text-ink/70'
                    }`}
                  >
                    <span>{range.label}</span>
                    {timeRange === range.id && <Check size={12} className="text-ink" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="p-1.5 bg-paper border border-ink/15 rounded-md hover:bg-ink/5 text-ink/80 transition-colors"
            title="Refresh Token Telemetry"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-ink' : ''} />
          </button>
        </div>
      </div>

      {/* Top Section: Cost & Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* Raw Token Cost */}
        <div className="bg-paper border border-ink/15 rounded-lg p-3.5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-mono font-semibold text-ink/40 tracking-wider uppercase mb-2">
              USAGECONFIG.RAWTOKENCOST
            </div>
            <div className="flex items-baseline gap-1 mb-0.5">
              <span className="text-2xl font-bold tracking-tight text-ink">{activeMetrics.rawCost}</span>
              <span className="text-xs font-semibold text-ink/50">*</span>
            </div>
            <p className="text-[11px] text-ink/50 mb-4">* if billed at full API rate</p>
          </div>

          <div>
            <div className="h-1.5 w-full bg-ink/10 rounded-full mb-2 overflow-hidden flex">
              <div className="h-full bg-ink/80 rounded-full" style={{ width: '100%' }}></div>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-ink/80"></div>
                <span className="font-semibold text-ink">DeepSeek</span>
              </div>
              <div className="flex items-center gap-3 text-ink/70">
                <span className="font-bold text-ink">{activeMetrics.rawCost}</span>
                <span>100.0% share</span>
                <span>{activeMetrics.processedTokens}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cost / Token Chart */}
        <div className="bg-paper border border-ink/15 rounded-lg p-3.5 shadow-xs flex flex-col">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-ink capitalize">{cadence} {chartMetric}</span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-ink/80"></div>
                <span className="text-[11px] text-ink/60">DeepSeek</span>
              </div>
            </div>
            <div className="flex bg-ink/5 rounded p-0.5">
              <button
                onClick={() => setChartMetric('cost')}
                className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider transition-colors ${
                  chartMetric === 'cost' ? 'bg-paper shadow-xs text-ink' : 'text-ink/50 hover:text-ink'
                }`}
              >
                COST
              </button>
              <button
                onClick={() => setChartMetric('tokens')}
                className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider transition-colors ${
                  chartMetric === 'tokens' ? 'bg-paper shadow-xs text-ink' : 'text-ink/50 hover:text-ink'
                }`}
              >
                TOKENS
              </button>
            </div>
          </div>
          <div className="h-28 relative">
            <div className="absolute inset-0 flex flex-col justify-between pt-1 pb-4">
              <div className="border-t border-ink/5 w-full border-dashed"></div>
              <div className="border-t border-ink/5 w-full border-dashed"></div>
              <div className="border-t border-ink/15 w-full"></div>
            </div>
            <div className="absolute left-0 top-0 bottom-4 flex flex-col justify-between text-[9px] font-mono text-ink/40 w-7">
              <span>{chartMetric === 'cost' ? '$0.06' : '2.0M'}</span>
              <span>{chartMetric === 'cost' ? '$0.03' : '1.0M'}</span>
              <span>0</span>
            </div>
            <div className="absolute left-8 right-0 bottom-4 top-0 flex items-end">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path
                  d={chartMetric === 'cost' ? 'M0,98 L75,98 L78,60 L80,98 L85,20 L90,98 L100,98' : 'M0,98 L60,98 L68,45 L75,85 L85,15 L92,80 L100,98'}
                  fill="none"
                  stroke="currentColor"
                  className="text-ink/60 transition-all duration-300"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="absolute left-8 right-0 bottom-0 h-4 flex justify-between text-[9px] text-ink/40 items-end">
              <span>Aug 8</span>
              <span>Aug 18</span>
              <span>Aug 28</span>
              <span>Sep 7</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of 5 Stats (Aligned & Symmetrical) */}
      <TokenUsageMetricsGrid activeMetrics={activeMetrics} />

      {/* Bottom Section: Breakdown & Cost Quality */}
      <TokenUsageBreakdown
        breakdownTab={breakdownTab}
        setBreakdownTab={setBreakdownTab}
        activeBreakdownRows={activeBreakdownRows}
        activeMetrics={activeMetrics}
      />

      <div className="text-center text-[10px] text-ink/40 pt-2">
        Scanned {activeMetrics.scannedTranscripts} transcripts (1 outside the window) · {activeMetrics.usageRecords} usage records · 0.1s
      </div>
    </div>
  );
}
