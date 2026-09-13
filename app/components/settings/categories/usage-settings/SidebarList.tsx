import { Bot, Coins } from 'lucide-react';
import type { UsageReport } from '@/types';
import { formatAmount } from '@/components/settings/categories/usage-settings/format';

export type UsageProviderId = 'kenari' | 'deepseek';

interface ProviderEntry {
  id: UsageProviderId;
  name: string;
  configured: boolean;
  error?: string;
  hint: string;
}

interface UsageSidebarListProps {
  report: UsageReport;
  selectedProviderId: UsageProviderId;
  onSelectProvider: (providerId: UsageProviderId) => void;
}

function buildProviders(report: UsageReport): ProviderEntry[] {
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

function statusLabel(provider: ProviderEntry): string {
  if (!provider.configured) return 'Not configured';
  if (provider.error) return 'Error';
  return 'Connected';
}

export function UsageSidebarList({
  report,
  selectedProviderId,
  onSelectProvider,
}: UsageSidebarListProps) {
  const providers = buildProviders(report);

  return (
    <div className="w-56 sm:w-64 border-r border-ink/10 h-full flex flex-col bg-paper/50 flex-shrink-0 select-none">
      <div className="px-3.5 py-2.5 border-b border-ink/10 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">Total {providers.length} providers</span>
      </div>

      <div className="flex-1 scrollbar-overlay-container scrollbar-overlay-static p-1.5 space-y-3 text-xs">
        <div>
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold text-ink/50 uppercase tracking-wider">
            Providers
          </div>
          <div className="space-y-0.5">
            {providers.map((provider) => {
              const isSelected = provider.id === selectedProviderId;
              const isConnected = provider.configured && !provider.error;
              const Icon = provider.id === 'kenari' ? Coins : Bot;

              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => onSelectProvider(provider.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer flex flex-col gap-0.5 group ${
                    isSelected
                      ? 'bg-ink/10 text-ink font-medium shadow-2xs'
                      : 'text-ink/80 hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="relative">
                        <Icon
                          className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-ink/80' : 'text-ink/60'}`}
                        />
                        <span
                          className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                            isConnected ? 'bg-ink' : 'bg-ink/20'
                          }`}
                        />
                      </div>
                      <span className="font-semibold text-xs text-ink truncate">{provider.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-ink/10 font-medium ${
                        provider.error ? 'text-error' : 'text-ink/70'
                      }`}
                    >
                      {statusLabel(provider)}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink/60 line-clamp-1 leading-snug pl-5">{provider.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
