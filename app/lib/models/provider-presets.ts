import type { PresetProviderOption, ProviderItem } from '@/types/settings/provider';

export function buildAvailableProviderPresets(
  providers: ProviderItem[],
  presets: PresetProviderOption[],
): PresetProviderOption[] {
  const connectedSlugs = new Set(
    providers
      .filter((provider) => provider.status === 'connected')
      .map((provider) => provider.slug.trim().toLowerCase()),
  );
  const seenSlugs = new Set<string>();
  const disconnectedProviders = providers
    .filter((provider) => provider.status !== 'connected')
    .map((provider) => ({
      id: provider.slug,
      name: provider.name,
      slug: provider.slug,
      icon: provider.icon,
      defaultUrl: provider.baseUrl || 'https://',
    }));

  return [...presets, ...disconnectedProviders].filter((preset) => {
    const slug = preset.slug.trim().toLowerCase();
    if (connectedSlugs.has(slug) || seenSlugs.has(slug)) return false;
    seenSlugs.add(slug);
    return true;
  });
}
