import type { ProviderItem } from '@/types';
import { ProviderIcon } from '@/components/settings/categories/provider-settings/ProviderIcons';

interface ProviderHeaderProps {
  provider: ProviderItem;
}

export function ProviderHeader({ provider }: ProviderHeaderProps) {
  return (
    <div className="flex flex-col gap-1 pb-4">
      <div className="flex items-center gap-2.5">
        <ProviderIcon icon={provider.icon} size={22} />
        <h2 className="text-xl font-bold tracking-tight text-ink">
          {provider.name}
        </h2>
      </div>
      <p className="text-xs font-mono text-ink/50 pl-8">
        {provider.slug}
      </p>
    </div>
  );
}
