import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { isMockMode } from '@/server/mock.server';
import { buildUsageProviders } from '@/server/lib/usage/providers.server';
import type { UsageProviderSummary, UsageReport } from '@/shared/types';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

/** Deterministic demo report so the Usage surfaces render under MOCK=true. */
function mockUsageReport(): UsageReport {
  const providers: UsageProviderSummary[] = [
    {
      id: 'kenari',
      name: 'Kenari.id',
      credentialSources: ['models.yml'],
      // kenari is a plain OpenAI-compatible gateway: omp ships no usage adapter.
      tracked: false,
      limits: [],
      kenari: {
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
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      credentialSources: ['agent.db'],
      tracked: false,
      limits: [],
      deepseek: {
        balance: {
          isAvailable: true,
          entries: [
            { currency: 'USD', totalBalance: '10.00', grantedBalance: '10.00', toppedUpBalance: '0.00' },
          ],
        },
      },
    },
    {
      id: 'anthropic',
      name: 'Anthropic (Claude Pro/Max)',
      credentialSources: ['agent.db'],
      tracked: true,
      limits: [
        {
          id: 'anthropic:5h',
          label: 'Claude 5 hour limit',
          windowLabel: '5h',
          used: 42,
          limit: 100,
          usedFraction: 0.42,
          unit: 'percent',
          status: 'ok',
          resetsAt: Date.now() + 3 * 60 * 60 * 1000,
        },
        {
          id: 'anthropic:7d',
          label: 'Claude weekly limit',
          windowLabel: '7d',
          used: 88,
          limit: 100,
          usedFraction: 0.88,
          unit: 'percent',
          status: 'warning',
          resetsAt: Date.now() + 4 * 24 * 60 * 60 * 1000,
        },
        {
          id: 'anthropic:fast',
          label: 'Fast requests',
          windowLabel: '24h',
          used: 320,
          limit: 500,
          usedFraction: 0.64,
          unit: 'requests',
          status: 'ok',
          resetsAt: Date.now() + 6 * 60 * 60 * 1000,
        },
      ],
    },
    {
      // A pay-as-you-go vendor: no omp adapter, only a credit balance.
      id: 'openrouter',
      name: 'OpenRouter',
      credentialSources: ['agent.db'],
      tracked: false,
      limits: [
        {
          id: 'openrouter:credits',
          label: 'Key credits',
          used: 25.5,
          limit: 100,
          remaining: 74.5,
          usedFraction: 0.255,
          unit: 'usd',
          status: 'ok',
        },
        {
          id: 'openrouter:daily',
          label: 'Spent today (monthly)',
          used: 1.82,
          unit: 'usd',
          status: 'unknown',
        },
      ],
    },
  ];

  return { isMock: true, generatedAt: new Date().toISOString(), providers };
}

/**
 * GET /api/settings/usage — provider quota and balance.
 *
 * Only providers with a detected credential appear in `providers`; a provider
 * whose key is missing is omitted rather than rendered as an empty row. A
 * provider-side failure is a per-provider `error` (HTTP 200), and only a
 * genuinely unexpected internal failure returns 500.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== 'GET') {
    return methodNotAllowed({ request, params });
  }
  if (isMockMode()) {
    return json(mockUsageReport(), { headers: NO_STORE_HEADERS });
  }
  try {
    // `?refresh=1` is the user's own Refresh button: provider quota is cached
    // for a minute (each read calls every provider's endpoint), but a manual
    // refresh must show fresh numbers rather than that snapshot.
    const force = new URL(request.url).searchParams.get('refresh') === '1';
    const report: UsageReport = {
      isMock: false,
      generatedAt: new Date().toISOString(),
      providers: await buildUsageProviders({ force }),
    };
    return json(report, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to load usage' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
