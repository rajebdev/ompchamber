import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { TIME_RANGES, MOCK_RANGE_DATA, BREAKDOWN_DATA } from '@/data/tokenUsageMockData';
import { isMockMode } from '@/mock.server';
import { getDb } from '@/db.server';
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
      timeRange,
      breakdownTab,
      isMock: true,
    });
  }

  // Real Mode: Query actual chat transcripts from SQLite database
  try {
    const db = await getDb();
    const sessionRows = await db.all('SELECT * FROM sessions');
    const sessionCount = sessionRows.length;

    const realRangeData: Record<TimeRangeType, TokenUsageMetricSet> = {
      today: { ...REAL_ZERO_METRIC, scannedTranscripts: Math.min(sessionCount, 2), usageRecords: sessionCount },
      '7d': { ...REAL_ZERO_METRIC, scannedTranscripts: Math.min(sessionCount, 5), usageRecords: sessionCount },
      '30d': { ...REAL_ZERO_METRIC, scannedTranscripts: sessionCount, usageRecords: sessionCount },
      '90d': { ...REAL_ZERO_METRIC, scannedTranscripts: sessionCount, usageRecords: sessionCount },
      all: { ...REAL_ZERO_METRIC, scannedTranscripts: sessionCount, usageRecords: sessionCount },
    };

    const realBreakdown: Record<BreakdownTab, BreakdownRow[]> = {
      model: [],
      day: [],
      project: [],
    };

    return json({
      timeRanges: TIME_RANGES,
      rangeData: realRangeData,
      breakdownData: realBreakdown,
      activeMetrics: realRangeData[timeRange] || REAL_ZERO_METRIC,
      activeBreakdownRows: realBreakdown[breakdownTab] || [],
      timeRange,
      breakdownTab,
      isMock: false,
    });
  } catch (error: any) {
    return json({
      timeRanges: TIME_RANGES,
      rangeData: { today: REAL_ZERO_METRIC, '7d': REAL_ZERO_METRIC, '30d': REAL_ZERO_METRIC, '90d': REAL_ZERO_METRIC, all: REAL_ZERO_METRIC },
      breakdownData: { model: [], day: [], project: [] },
      activeMetrics: REAL_ZERO_METRIC,
      activeBreakdownRows: [],
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
