import type { AIModelOption } from '@/shared/types';
import { modelKey } from '@/shared/lib/models/identity';

export interface ModelPickerGroups {
  filtered: AIModelOption[];
  favorites: AIModelOption[];
  recent: AIModelOption[];
  /** Provider display name (upper-cased) → its models, in catalog order. */
  byProvider: Record<string, AIModelOption[]>;
  /** Sections expanded, in the order the panel renders them. */
  visibleFlatList: AIModelOption[];
  /** Composite key → index in `visibleFlatList`, for hover/keyboard focus. */
  index: Record<string, number>;
}

/**
 * All derived picker state in one place: search filtering, the favorites/recent
 * rails, the per-provider grouping, and the flattened key→index map the
 * keyboard navigation addresses rows through.
 *
 * Keying `index` on the composite identity matters — the same model id is served
 * by several providers, so an id-only key collapsed their rows onto one index
 * and hovering one highlighted every other provider's row.
 */
export function buildPickerGroups(
  models: AIModelOption[],
  search: string,
  collapsedSections: Record<string, boolean>,
): ModelPickerGroups {
  const query = search.trim().toLowerCase();
  const filtered = query
    ? models.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query) ||
        String(m.contextWindow ?? '').toLowerCase().includes(query) ||
        m.capabilities?.some(c => c.toLowerCase().includes(query))
      )
    : models;

  const favorites = filtered.filter(m => m.isFavorite);
  const recent = filtered.filter(m => m.isRecent && !m.isFavorite);

  const byProvider: Record<string, AIModelOption[]> = {};
  for (const model of filtered) {
    const provider = model.provider.toUpperCase();
    (byProvider[provider] ??= []).push(model);
  }

  const visibleFlatList: AIModelOption[] = [];
  if (!collapsedSections['favorites']) visibleFlatList.push(...favorites);
  if (!collapsedSections['recent']) visibleFlatList.push(...recent);
  for (const [provider, groupModels] of Object.entries(byProvider)) {
    if (!collapsedSections[provider]) visibleFlatList.push(...groupModels);
  }

  const index: Record<string, number> = {};
  visibleFlatList.forEach((model, i) => {
    index[modelKey(model)] = i;
  });

  return { filtered, favorites, recent, byProvider, visibleFlatList, index };
}
