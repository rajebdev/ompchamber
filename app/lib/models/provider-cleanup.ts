import type { ProviderItem, ProviderModel } from '@/types';

const LEGACY_FALLBACK_ID = /^model-\d+-(?:1|2)$/;

export function isKenariProvider(provider: Pick<ProviderItem, 'name' | 'slug' | 'baseUrl'>): boolean {
  const identity = `${provider.name} ${provider.slug} ${provider.baseUrl || ''}`.toLowerCase();
  return identity.includes('kenari');
}

export function removeLegacyKenariModels(
  provider: Pick<ProviderItem, 'name' | 'slug' | 'baseUrl'>,
  models: ProviderModel[],
): ProviderModel[] {
  if (!isKenariProvider(provider)) return models;
  return models.filter((model) => {
    const name = model.name.trim().toLowerCase();
    const isFallbackName = name === 'kenari default model' || name === 'kenari fast / flash';
    return !(LEGACY_FALLBACK_ID.test(model.id) && isFallbackName);
  });
}
