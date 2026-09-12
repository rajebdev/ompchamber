import type { ComposerMatchItem, ComposerPickItem } from '@/types';

interface RankedMatch {
  tier: number;
  index: number;
  match: { start: number; end: number } | null;
}

/**
 * Score a single item against a query. Tier order: exact name > name
 * startsWith > name includes > description includes. Returns null on no match.
 */
export function rankComposerItem(
  name: string,
  description: string,
  query: string,
): { tier: number; match: { start: number; end: number } | null } | null {
  const q = query.trim().toLowerCase();
  if (q === '') return null;

  const lowerName = name.toLowerCase();
  const lowerDescription = description.toLowerCase();

  if (lowerName === q) return { tier: 0, match: { start: 0, end: name.length } };
  if (lowerName.startsWith(q)) return { tier: 1, match: { start: 0, end: q.length } };

  const nameIndex = lowerName.indexOf(q);
  if (nameIndex >= 0) return { tier: 2, match: { start: nameIndex, end: nameIndex + q.length } };

  if (lowerDescription.includes(q)) return { tier: 3, match: null };

  return null;
}

/** Filter items by query, ranked by tier then original order. */
export function filterComposerItems(items: ComposerPickItem[], query: string): ComposerMatchItem[] {
  if (query.trim() === '') {
    return items.map((item) => ({ ...item, match: null }));
  }

  const ranked: RankedMatch[] = [];
  items.forEach((item, index) => {
    const score = rankComposerItem(item.name, item.description, query);
    if (score) ranked.push({ ...score, index });
  });

  ranked.sort((a, b) => a.tier - b.tier || a.index - b.index);

  return ranked.map((entry) => ({ ...items[entry.index], match: entry.match }));
}
