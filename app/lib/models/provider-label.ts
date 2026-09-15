/**
 * Pure provider-slug → display-label helpers (theme-independent, no React).
 */

/** Shape of the per-provider info carried by `ModelsData.connectedProviders`. */
export type ProviderNameInfo = { id: string; name: string; disabled: boolean };

/**
 * Title-case a provider slug like `kenari` → `Kenari`, `command-code` →
 * `Command Code`, `openai_codex` → `Openai Codex`. Empty slugs return an empty
 * label so callers can omit the provider metadata item.
 */
export function titleCaseProviderSlug(slug: string): string {
  if (!slug.trim()) return '';
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Resolve a provider slug to a human label: prefer the connected-provider
 * display name when the slug matches one, otherwise title-case the slug.
 */
export function providerLabel(slug: string, names: Record<string, string> = {}): string {
  if (!slug.trim()) return '';
  const known = names[slug];
  return known?.trim() ? known : titleCaseProviderSlug(slug);
}

/** Build a slug → display-name map from `/api/models` `connectedProviders`. */
export function providerNamesFromConnected(
  connectedProviders: readonly ProviderNameInfo[] | undefined,
): Record<string, string> {
  if (!connectedProviders?.length) return {};
  return Object.fromEntries(
    connectedProviders.filter((p) => p.name?.trim()).map((p): [string, string] => [p.id, p.name]),
  );
}
