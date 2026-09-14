import type { UsageReport } from '@/types';
import { ProviderCard } from '@/components/settings/categories/usage-settings/ProviderCard';
import { KenariCard } from '@/components/settings/categories/usage-settings/KenariCard';
import { DeepSeekCard } from '@/components/settings/categories/usage-settings/DeepSeekCard';
import type { UsageProviderId } from '@/components/settings/categories/usage-settings/providers';

const DEEPSEEK_NOTE =
  'DeepSeek exposes no usage or quota API — only the prepaid balance (and the web console at platform.deepseek.com) is available.';

interface ProviderDetailProps {
  providerId: UsageProviderId;
  report: UsageReport;
}

/** Renders one provider's card (Kenari.id or DeepSeek) from a usage report. */
export function ProviderDetail({ providerId, report }: ProviderDetailProps) {
  if (providerId === 'kenari') {
    return (
      <ProviderCard
        providerName="Kenari.id"
        configured={report.kenari.configured}
        error={report.kenari.error}
      >
        <KenariCard report={report.kenari} />
      </ProviderCard>
    );
  }

  return (
    <ProviderCard
      providerName="DeepSeek"
      configured={report.deepseek.configured}
      error={report.deepseek.error}
      note={DEEPSEEK_NOTE}
    >
      <DeepSeekCard report={report.deepseek} />
    </ProviderCard>
  );
}
