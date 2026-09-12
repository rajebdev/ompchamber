import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { TIME_RANGES, MOCK_RANGE_DATA, BREAKDOWN_DATA } from '@/data/mock/token-usage';
import { isMockMode } from '@/mock.server';
import { aggregateUsage, toBreakdownRows, toMetricSet } from '@/lib/omp/session/usage';
import type { TimeRangeType, BreakdownTab, TokenUsageMetricSet, BreakdownRow } from '@/types';

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

/** Optional per-model rates from the models.dev catalog (input/output per
 * 1M tokens). Failures degrade to an empty map — pricing is supplementary. */
async function loadModelRates(modelNames: string[]): Promise<Record<string, { input?: number; output?: number }>> {
  try {
    const response = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return {};
    const catalog = await response.json() as Record<string, { models?: Record<string, { name?: string; cost?: { input?: number; output?: number } }> }>;
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
  const mock = isMockMode();

  if (mock) {
    const activeMetrics = MOCK_RANGE_DATA[timeRange] || MOCK_RANGE_DATA['30d'];
    const activeBreakdownRows = BREAKDOWN_DATA[breakdownTab] || BREAKDOWN_DATA.model;

    return json({
      timeRanges: TIME_RANGES,
      rangeData: MOCK_RANGE_DATA,
      breakdownData: BREAKDOWN_DATA,
      activeMetrics,
      activeBreakdownRows,
      metrics: activeMetrics,
      breakdownRows: activeBreakdownRows,
      timeRange,
      breakdownTab,
      isMock: true,
    });
  }

  // Real Mode: aggregate actual token/cost usage from omp session files.
  try {
    const ranges: TimeRangeType[] = ['today', '7d', '30d', '90d', 'all'];
    const realRangeData = {} as Record<TimeRangeType, TokenUsageMetricSet>;
    for (const range of ranges) {
      realRangeData[range] = toMetricSet(aggregateUsage(range));
    }

    const activeAggregate = aggregateUsage(timeRange);
    const realBreakdown: Record<BreakdownTab, BreakdownRow[]> = {
      model: toBreakdownRows(activeAggregate, 'model'),
      day: toBreakdownRows(activeAggregate, 'day'),
      project: toBreakdownRows(activeAggregate, 'project'),
    };
    const activeMetrics = realRangeData[timeRange] || realRangeData['30d'];
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
      metrics: activeMetrics,
      breakdownRows: activeBreakdownRows,
      pricing: perModelRates,
      timeRange,
      breakdownTab,
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
      metrics: REAL_ZERO_METRIC,
      breakdownRows: [],
      timeRange,
      breakdownTab,
      isMock: false,
      error: error.message,
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === 'POST') {
    return json({ success: true, timestamp: new Date().toISOString() });
  }
  return json({ error: 'Method not allowed' }, { status: 405 });
}
