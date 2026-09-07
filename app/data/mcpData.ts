import type { McpServerItem } from '@/types';

export const DEFAULT_MCP_SERVERS: McpServerItem[] = [
  {
    id: 'mcp-codegraph',
    name: 'codegraph',
    scope: 'every-project',
    enabled: true,
    reachType: 'command',
    commandArgs: ['codegraph', 'serve', '--mcp'],
    envVars: [],
    status: 'active',
  },
  {
    id: 'mcp-needmcp',
    name: 'needmcp',
    scope: 'every-project',
    enabled: true,
    reachType: 'link',
    commandArgs: [],
    linkUrl: 'https://needmcp.com/mcp',
    envVars: [
      { id: 'env-1', key: 'NEEDMCP_API_KEY', value: 'nm_live_89f02c91b4e672' },
      { id: 'env-2', key: 'DEFAULT_TIMEOUT_MS', value: '5000' },
    ],
    status: 'active',
  },
];
