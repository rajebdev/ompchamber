import type { UsageReport } from '@/shared/types';
import { formatAmount } from '@/client/components/settings/categories/usage-settings/format';

/** Providers surfaced in the Settings → Usage sidebar and the Usage right panel. */
export type UsageProviderId = 'kenari' | 'deepseek';

export interface ProviderEntry {
  id: UsageProviderId;
  name: string;
  configured: boolean;
  error?: string;
  hint: string;
}

/** Derives the provider list (status + hint) from a usage report. */
export function buildProviders(report: UsageReport): ProviderEntry[] {
  const kenariBalance = report.kenari.quota?.planName;
  const deepseekEntry = report.deepseek.balance?.entries[0];

  return [
    {
      id: 'kenari',
      name: 'Kenari.id',
      configured: report.kenari.configured,
      error: report.kenari.error,
      hint: kenariBalance ?? 'Wallet & quota',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      configured: report.deepseek.configured,
      error: report.deepseek.error,
      hint: deepseekEntry
        ? `${deepseekEntry.currency} ${formatAmount(deepseekEntry.totalBalance)}`
        : 'Prepaid balance',
    },
  ];
}

/** Human-readable connection state for a provider entry. */
export function statusLabel(provider: ProviderEntry): string {
  if (!provider.configured) return 'Not configured';
  if (provider.error) return 'Error';
  return 'Connected';
}
