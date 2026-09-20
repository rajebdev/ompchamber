
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Check, ChevronDown, RefreshCw } from 'lucide-preact';
import type { BreakdownTab, CadenceType, ChartMetric, ChartSeriesPoint, SettingsState, TimeRangeType } from '@/shared/types';
import { TokenUsageMetricsGrid } from '@/client/components/settings/categories/token-usage-settings/MetricsGrid';
import { TokenUsageBreakdown } from '@/client/components/settings/categories/token-usage-settings/Breakdown';
import { UsageChart } from '@/client/components/settings/categories/token-usage-settings/Chart';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';

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
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState(monthAgo);
  const [customTo, setCustomTo] = useState(today);

  const [timeRanges, setTimeRanges] = useState<any[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<any>(null);
  const [activeBreakdownRows, setActiveBreakdownRows] = useState<any[]>([]);
  const [chartSeries, setChartSeries] = useState<ChartSeriesPoint[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(dropdownRef, () => setIsDropdownOpen(false));

  const loadData = useCallback(() => {
    setIsRefreshing(true);
    const customParams = timeRange === 'custom' ? `&customFrom=${customFrom}&customTo=${customTo}` : '';
    fetch(`/api/telemetry/tokens?timeRange=${timeRange}&breakdownTab=${breakdownTab}&cadence=${cadence}${customParams}`)
      .then(res => res.json())
      .then(data => {
        if (data.timeRanges) setTimeRanges(data.timeRanges);
        if (data.metrics) setActiveMetrics(data.metrics);
        if (data.breakdownRows) setActiveBreakdownRows(data.breakdownRows);
        if (data.chartSeries) setChartSeries(data.chartSeries);
      })
      .catch(err => console.error('Failed to load token telemetry:', err))
      .finally(() => setIsRefreshing(false));
  }, [timeRange, breakdownTab, cadence, customFrom, customTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData();
  };

  const selectedRangeObj = timeRanges.find((r) => r.id === timeRange) || timeRanges[0] || { id: timeRange, label: timeRange, dateRange: 'Current Period' };
  const periodLabel = timeRange === 'custom'
    ? `${customFrom} to ${customTo}`
    : selectedRangeObj.dateRange;

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
          <span className="text-xs font-semibold text-ink/75">{periodLabel}</span>
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
                      if (range.id !== 'custom') setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-ink/5 transition-colors ${
                      timeRange === range.id ? 'font-semibold text-ink bg-ink/5' : 'text-ink/70'
                    }`}
                  >
                    <span>{range.label}</span>
                    {timeRange === range.id && <Check size={12} className="text-ink" />}
                  </button>
                ))}
                {timeRange === 'custom' && (
                  <div className="px-3 py-2 space-y-2">
                    <label className="block">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-ink/40">From</span>
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo}
                        onChange={(e) => setCustomFrom(e.currentTarget.value)}
                        className="mt-0.5 w-full bg-paper border border-ink/15 rounded px-1.5 py-1 text-[11px] text-ink focus:outline-none focus:border-ink/40"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-ink/40">To</span>
                      <input
                        type="date"
                        value={customTo}
                        min={customFrom}
                        max={today}
                        onChange={(e) => setCustomTo(e.currentTarget.value)}
                        className="mt-0.5 w-full bg-paper border border-ink/15 rounded px-1.5 py-1 text-[11px] text-ink focus:outline-none focus:border-ink/40"
                      />
                    </label>
                    <button
                      onClick={() => setIsDropdownOpen(false)}
                      className="w-full bg-ink/10 hover:bg-ink/20 text-ink font-semibold rounded px-2 py-1 transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                )}
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
        <UsageChart cadence={cadence} metric={chartMetric} series={chartSeries} />
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
        cadence={cadence}
      />

      <div className="text-center text-[10px] text-ink/40 pt-2">
        Scanned {activeMetrics.scannedTranscripts} transcripts (1 outside the window) · {activeMetrics.usageRecords} usage records · 0.1s
      </div>
    </div>
  );
}
