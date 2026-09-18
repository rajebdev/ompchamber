import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { buildKenariReport } from '@/server/lib/usage/kenari';
import { buildDeepSeekReport } from '@/server/lib/usage/deepseek';
import type { UsageReport } from '@/shared/types';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

/** Deterministic demo report so the Usage panel renders under MOCK=true. */
function mockUsageReport(): UsageReport {
  return {
    isMock: true,
    generatedAt: new Date().toISOString(),
    kenari: {
      configured: true,
      balance: { amountRp: 25_000, raw: 'Saldo: Rp 25.000' },
      usage: {
        rows: [
          { model: 'gemini-3-7-flash', requests: 37, inputTokens: 22255, outputTokens: 11487, costRp: 0 },
          { model: 'glm-5-3-flash', requests: 2122, inputTokens: 369435677, outputTokens: 914679, costRp: 0 },
        ],
        totalRequests: 5941,
        totalCostRp: 0,
        raw: 'Pemakaian 30 hari terakhir (biaya Rupiah).',
      },
      quota: {
        planName: 'Pro',
        windows: [
          { key: 'five_hour', label: '5 hours', usedRp: 0, remainingRp: 50_000, resetsAt: '2026-09-14T10:00:00.000Z' },
          { key: 'week', label: 'Weekly', usedRp: 12_500, remainingRp: 287_500, resetsAt: '2026-09-20T00:00:00.000Z' },
          { key: 'month', label: 'Monthly', usedRp: 120_000, remainingRp: 880_000, resetsAt: '2026-10-01T00:00:00.000Z' },
        ],
        coupon: null,
      },
    },
    deepseek: {
      configured: true,
      balance: {
        isAvailable: true,
        entries: [
          { currency: 'USD', totalBalance: '10.00', grantedBalance: '10.00', toppedUpBalance: '0.00' },
        ],
      },
    },
  };
}

/**
 * GET /api/settings/usage — balance / usage / quota for the configured
 * providers. Both provider reports are always present; a missing key is
 * `configured: false`, an upstream failure is a per-provider `error` (HTTP
 * 200), and only a genuinely unexpected internal failure returns 500.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (isMockMode()) {
    return json(mockUsageReport(), { headers: NO_STORE_HEADERS });
  }
  try {
    const [kenari, deepseek] = await Promise.all([
      buildKenariReport(),
      buildDeepSeekReport(),
    ]);
    const report: UsageReport = {
      isMock: false,
      generatedAt: new Date().toISOString(),
      kenari,
      deepseek,
    };
    return json(report, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to load usage' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
