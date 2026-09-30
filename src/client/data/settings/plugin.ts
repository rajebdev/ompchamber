import type { PluginCatalogItem, PluginItem, PluginMarketplaceItem } from '@/shared/types';

/**
 * Deterministic demo plugins for MOCK mode.
 *
 * Every shape the panel can draw is represented once: a marketplace plugin with
 * a manifest and an update available, a package plugin with features and
 * settings, a shadowed user install, a plugin with no `omp` manifest at all
 * (conventional `skills/` content only), and a disabled one.
 */
export const DEFAULT_PLUGINS: PluginItem[] = [
  {
    id: 'code-review@claude-plugins-official',
    name: 'code-review',
    packageName: 'code-review',
    version: '0.0.0',
    kind: 'marketplace',
    scope: 'user',
    enabled: true,
    description: 'Automated code review for pull requests using specialized agents.',
    marketplace: 'claude-plugins-official',
    installPath: '~/.omp/plugins/cache/plugins/claude-plugins-official___code-review___0.0.0',
    enabledFeatures: null,
    features: [],
    settings: [],
  },
  {
    id: 'demo-tools@acme-marketplace',
    name: 'demo-tools',
    packageName: 'demo-tools',
    version: '1.2.0',
    kind: 'marketplace',
    scope: 'project',
    enabled: true,
    description: 'Demo project-scoped plugin with a manifest.',
    marketplace: 'acme-marketplace',
    installPath: '~/.omp/plugins/cache/plugins/acme-marketplace___demo-tools___1.2.0',
    enabledFeatures: ['lint'],
    features: [
      { name: 'lint', description: 'Run the linter after every edit.', isDefault: true },
      { name: 'deploy', description: 'Register the deploy command.' },
    ],
    settings: [
      { key: 'endpoint', type: 'string', description: 'Base URL of the demo service.', default: 'https://example.com' },
      { key: 'apiKey', type: 'string', description: 'Secret key.', secret: true },
    ],
    settingValues: { endpoint: 'https://staging.example.com' },
    updateAvailable: '1.3.0',
  },
  {
    id: 'demo-tools@acme-marketplace',
    name: 'demo-tools',
    packageName: 'demo-tools',
    version: '1.1.0',
    kind: 'marketplace',
    scope: 'user',
    enabled: false,
    description: 'Demo project-scoped plugin with a manifest.',
    marketplace: 'acme-marketplace',
    shadowedBy: 'project',
    enabledFeatures: null,
    features: [
      { name: 'lint', description: 'Run the linter after every edit.', isDefault: true },
      { name: 'deploy', description: 'Register the deploy command.' },
    ],
    settings: [],
  },
  {
    id: 'skills-only-plugin',
    name: 'skills-only-plugin',
    packageName: 'skills-only-plugin',
    version: '3.0.1',
    kind: 'package',
    scope: 'user',
    enabled: true,
    description: '',
    installPath: '~/.omp/plugins/node_modules/skills-only-plugin',
    enabledFeatures: null,
    features: [],
    settings: [],
  },
];

export const DEFAULT_PLUGIN_MARKETPLACES: PluginMarketplaceItem[] = [
  {
    name: 'claude-plugins-official',
    sourceType: 'github',
    sourceUri: 'anthropics/claude-plugins-official',
    addedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
    pluginCount: 314,
  },
  {
    name: 'acme-marketplace',
    sourceType: 'git',
    sourceUri: 'https://github.com/acme/plugins.git',
    addedAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z',
    pluginCount: 2,
  },
];

export const DEFAULT_PLUGIN_CATALOG: PluginCatalogItem[] = [
  {
    name: 'code-review',
    marketplace: 'claude-plugins-official',
    description: 'Automated code review for pull requests using specialized agents.',
    category: 'productivity',
    homepage: 'https://github.com/anthropics/claude-plugins-public',
    installed: true,
  },
  {
    name: 'demo-tools',
    marketplace: 'acme-marketplace',
    description: 'Demo project-scoped plugin with a manifest.',
    category: 'development',
    version: '1.3.0',
    installed: true,
  },
  {
    name: 'playwright',
    marketplace: 'claude-plugins-official',
    description: 'Browser automation and end-to-end testing MCP server.',
    category: 'testing',
    installed: false,
  },
];
