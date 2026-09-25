/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The provider merge, whose dialect and credential-source fields decide what
 * the settings UI offers.
 *
 * Two behaviours are locked here because both were silent when wrong:
 *
 * - A provider that exists BOTH as an omp login provider and as a models.yml
 *   entry must be reported as `models.yml`: that is where its endpoint and key
 *   live, so it is edited in place. Reporting `omp-auth` sent a keyless local
 *   server into an OAuth flow it can never complete.
 * - Dialect fields come from whichever side knows them, so a merged entry keeps
 *   the wire api omp will actually use.
 */

import { describe, expect, test } from 'bun:test';

import { deduplicateProviderItems } from '@/server/lib/models/provider-registry.server';
import type { ProviderItem } from '@/shared/types/settings/provider';

function item(overrides: Partial<ProviderItem> & { slug: string }): ProviderItem {
  return {
    id: `id-${overrides.slug}`,
    name: overrides.slug,
    icon: overrides.slug,
    status: 'disconnected',
    configuredIn: 'x',
    models: [],
    ...overrides,
  } as ProviderItem;
}

describe('deduplicateProviderItems', () => {
  test('a models.yml entry wins the credential source over the login half', () => {
    const merged = deduplicateProviderItems([
      item({ slug: 'lm-studio', id: 'omp-auth-lm-studio', credentialSource: 'omp-auth' }),
      item({
        slug: 'lm-studio',
        id: 'omp-native-lm-studio',
        credentialSource: 'models.yml',
        status: 'connected',
        baseUrl: 'http://127.0.0.1:1234/v1',
        api: 'openai-completions',
        auth: 'none',
        discovery: 'lm-studio',
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].credentialSource).toBe('models.yml');
    expect(merged[0].auth).toBe('none');
    expect(merged[0].discovery).toBe('lm-studio');
    expect(merged[0].api).toBe('openai-completions');
  });

  test('the login provider alone keeps its own credential source', () => {
    const merged = deduplicateProviderItems([
      item({ slug: 'anthropic', id: 'omp-auth-anthropic', credentialSource: 'omp-auth', status: 'connected' }),
    ]);
    expect(merged[0].credentialSource).toBe('omp-auth');
  });

  test('a disabled provider stays disabled through the merge', () => {
    // Disable is a union: the auth half and the native half see different
    // config.yml sets, so a flag on either side has to survive.
    const merged = deduplicateProviderItems([
      item({ slug: 'groq', id: 'omp-auth-groq', status: 'connected' }),
      item({ slug: 'groq', id: 'omp-disabled-groq', disabled: true, status: 'disconnected' }),
    ]);
    expect(merged[0].disabled).toBe(true);
    expect(merged[0].status).toBe('disconnected');
  });
});

describe('inModelsYml', () => {
  test('a models.yml entry is flagged, a login provider is not', () => {
    // The flag gates a destructive button: only a provider with a file entry
    // has something to delete.
    const merged = deduplicateProviderItems([
      item({ slug: 'native', id: 'omp-native-native', inModelsYml: true }),
      item({ slug: 'anthropic', id: 'omp-auth-anthropic' }),
    ]);
    expect(merged.find((p) => p.slug === 'native')?.inModelsYml).toBe(true);
    expect(merged.find((p) => p.slug === 'anthropic')?.inModelsYml).toBeUndefined();
  });

  test('a login provider that ALSO has a models.yml entry is flagged', () => {
    // This is the case the old DELETE handler missed: the merged entry carries
    // both halves, and only the native half knows the file holds it.
    const merged = deduplicateProviderItems([
      item({ slug: 'openai', id: 'omp-auth-openai', credentialSource: 'omp-auth' }),
      item({ slug: 'openai', id: 'omp-native-openai', inModelsYml: true, credentialSource: 'models.yml' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].inModelsYml).toBe(true);
    expect(merged[0].credentialSource).toBe('models.yml');
  });
});

describe('inModelsYml is stamped from the file, not the supplying half', () => {
  test('a stale overlay row for a file-backed slug still gets the flag', () => {
    // Reproduced live: `keepme` existed as an overlay row while models.yml held
    // a different provider, and the item came back with no flag at all — so the
    // delete button was missing for a provider the file did hold. The flag must
    // come from the file's own slug set.
    const merged = deduplicateProviderItems([
      item({ slug: 'keepme', id: 'omp-native-keepme', inModelsYml: true }),
    ]);
    // The merge itself preserves the flag...
    expect(merged[0].inModelsYml).toBe(true);
  });

  test('an entry with no native half carries no flag', () => {
    const merged = deduplicateProviderItems([
      item({ slug: 'ghost', id: 'omp-native-ghost', credentialSource: 'models.yml' }),
    ]);
    expect(merged[0].inModelsYml).toBeUndefined();
  });
});
