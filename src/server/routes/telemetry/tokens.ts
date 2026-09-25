import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { BREAKDOWN_DATA, MOCK_CHART_SERIES, MOCK_CUSTOM_RANGE_DATA, MOCK_RANGE_DATA, TIME_RANGES } from '@/client/data/mock/token-usage';
import { isMockMode } from '@/server/mock.server';
import { loadModelsDevCatalog } from '@/shared/lib/models/catalog';
import { aggregateUsage, buildChartSeries, toBreakdownRows, toMetricSet, type UsageWindow } from '@/server/lib/omp/session/usage/aggregate';
import type { BreakdownRow, BreakdownTab, CadenceType, ChartSeriesPoint, TimeRangeType, TokenUsageMetricSet } from '@/shared/types';

const REAL_ZERO_METRIC: TokenUsageMetricSet = {
  rawCost: '$0.00',
  processedTokens: '0',
  activeRate: '0 per active day',
  cachedInput: '0',
  cachedPercent: '0.0% of observed input',
  uncachedInput: '0',
  outputTokens: '0',
  reasoning: 'includes 0 reasoning',
  cacheSavings: '$0.00',
  scannedTranscripts: 0,
  usageRecords: 0,
};

const PRESET_RANGES: Exclude<TimeRangeType, 'custom'>[] = ['today', '7d', '30d', '90d', 'all'];
const CADENCES: CadenceType[] = ['daily', 'weekly', 'monthly'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseWindow(url: URL): UsageWindow {
  const timeRange = (url.searchParams.get('timeRange') as TimeRangeType) || '30d';
  if (timeRange === 'custom') {
    const from = url.searchParams.get('customFrom') || '';
    const to = url.searchParams.get('customTo') || '';
    if (ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to) {
      return { kind: 'custom', from, to };
    }
    return { kind: 'preset', range: '30d' };
  }
  if (timeRange === 'all') return { kind: 'all' };
  if (PRESET_RANGES.includes(timeRange as Exclude<TimeRangeType, 'custom'>)) {
    return { kind: 'preset', range: timeRange as Exclude<TimeRangeType, 'custom'> };
  }
  return { kind: 'preset', range: '30d' };
}

/** Optional per-model rates from the models.dev catalog (input/output per
 *  1M tokens). Failures degrade to an empty map — pricing is supplementary. */
async function loadModelRates(modelNames: string[]): Promise<Record<string, { input?: number; output?: number }>> {
  try {
    const catalog = await loadModelsDevCatalog();
    const rates: Record<string, { input?: number; output?: number }> = {};
    for (const name of modelNames) {
      const bare = name.split('/').pop()?.toLowerCase() ?? name.toLowerCase();
      for (const provider of Object.values(catalog)) {
        const models = provider?.models;
        if (!models || typeof models !== 'object') continue;
        const match = Object.entries(models).find(([key, model]) => {
          const candidates = [key.toLowerCase(), (model?.name ?? '').toLowerCase()];
          return candidates.some((candidate) => candidate === bare || candidate === name.toLowerCase());
        });
        if (match) {
          rates[name] = { input: match[1]?.cost?.input, output: match[1]?.cost?.output };
          break;
        }
      }
    }
    return rates;
  } catch {
    return {};
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const timeRange = (url.searchParams.get('timeRange') as TimeRangeType) || '30d';
  const breakdownTab = (url.searchParams.get('breakdownTab') as BreakdownTab) || 'model';
  const cadenceParam = url.searchParams.get('cadence');
  const cadence = CADENCES.includes(cadenceParam as CadenceType) ? (cadenceParam as CadenceType) : 'daily';
  const window = parseWindow(url);
  const mock = isMockMode();

  if (mock) {
    const activeMetrics = window.kind === 'custom'
      ? MOCK_CUSTOM_RANGE_DATA
      : (MOCK_RANGE_DATA[timeRange as Exclude<TimeRangeType, 'custom'>] || MOCK_RANGE_DATA['30d']);
    const activeBreakdownRows = BREAKDOWN_DATA[breakdownTab] || BREAKDOWN_DATA.model;
    const chartSeries = MOCK_CHART_SERIES[cadence] || MOCK_CHART_SERIES.daily;

    return json({
      timeRanges: TIME_RANGES,
      rangeData: MOCK_RANGE_DATA,
      breakdownData: BREAKDOWN_DATA,
      activeMetrics,
      activeBreakdownRows,
      chartSeries,
      metrics: activeMetrics,
      breakdownRows: activeBreakdownRows,
      timeRange,
      breakdownTab,
      cadence,
      isMock: true,
    });
  }

  // Real Mode: aggregate actual token/cost usage from omp session files.
  try {
    const realRangeData = {} as Record<Exclude<TimeRangeType, 'custom'>, TokenUsageMetricSet>;
    for (const range of PRESET_RANGES) {
      realRangeData[range] = toMetricSet(await aggregateUsage({ kind: 'preset', range }), cadence);
    }

    const activeAggregate = await aggregateUsage(window);
    const realBreakdown: Record<BreakdownTab, BreakdownRow[]> = {
      model: toBreakdownRows(activeAggregate, 'model'),
      day: toBreakdownRows(activeAggregate, 'day', cadence),
      project: toBreakdownRows(activeAggregate, 'project'),
    };
    const activeMetrics = toMetricSet(activeAggregate, cadence);
    const activeBreakdownRows = realBreakdown[breakdownTab] || [];
    const perModelRates = await loadModelRates(
      realBreakdown.model.map((row) => row.name),
    );

    return json({
      timeRanges: TIME_RANGES,
      rangeData: realRangeData,
      breakdownData: realBreakdown,
      activeMetrics,
      activeBreakdownRows,
      chartSeries: buildChartSeries(activeAggregate, cadence),
      metrics: activeMetrics,
      breakdownRows: activeBreakdownRows,
      pricing: perModelRates,
      timeRange,
      breakdownTab,
      cadence,
      isMock: false,
    });
  } catch (error: any) {
    const zeroBreakdown: Record<BreakdownTab, BreakdownRow[]> = { model: [], day: [], project: [] };
    return json({
      timeRanges: TIME_RANGES,
      rangeData: { today: REAL_ZERO_METRIC, '7d': REAL_ZERO_METRIC, '30d': REAL_ZERO_METRIC, '90d': REAL_ZERO_METRIC, all: REAL_ZERO_METRIC },
      breakdownData: zeroBreakdown,
      activeMetrics: REAL_ZERO_METRIC,
      activeBreakdownRows: [],
      chartSeries: [] as ChartSeriesPoint[],
      metrics: REAL_ZERO_METRIC,
      breakdownRows: [],
      timeRange,
      breakdownTab,
      cadence,
      isMock: false,
      error: error.message,
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method === 'POST') {
    return json({ success: true, timestamp: new Date().toISOString() });
  }
  return methodNotAllowed({ request, params });
}
