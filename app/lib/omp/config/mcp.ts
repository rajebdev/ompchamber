/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Native OMP MCP config access — faithful adaptation of omp-web/lib/omp/mcp-config.ts.
 * Reads user-level ~/.omp/agent/mcp.json and project-level mcp.json so the
 * settings MCP list reflects what the omp agent actually loads. Credentials
 * (env/headers) are never exposed to the browser.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { getAgentDir } from '@/lib/omp/core/paths';

const MAX_MCP_CONFIG_BYTES = 512 * 1024;
const SERVER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type McpServer = Record<string, unknown>;
export type McpFile = Record<string, unknown> & { mcpServers?: Record<string, McpServer> };

export interface McpUserConfig {
  path: string;
  servers: Array<{ name: string; config: McpServer }>;
  disabledServers: string[];
  error?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serverEntries(config: McpFile): Array<{ name: string; config: McpServer }> {
  return Object.entries(config.mcpServers ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, server]) => ({ name, config: server }));
}

/** Read ~/.omp/agent/mcp.json (user scope) without throwing. */
export function readUserMcpConfig(path = join(getAgentDir(), 'mcp.json')): McpUserConfig {
  if (!existsSync(path)) return { path, servers: [], disabledServers: [] };
  try {
    if (statSync(path).size > MAX_MCP_CONFIG_BYTES) throw new Error('configuration is too large to inspect');
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed)) throw new Error('configuration must contain a JSON object');
    if (parsed.mcpServers !== undefined && !isRecord(parsed.mcpServers)) throw new Error('mcpServers must be an object');
    return {
      path,
      servers: serverEntries(parsed as McpFile),
      disabledServers: Array.isArray(parsed.disabledServers)
        ? parsed.disabledServers.filter((name): name is string => typeof name === 'string')
        : [],
    };
  } catch (error) {
    return { path, servers: [], disabledServers: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/** Atomic read-modify-write of one server entry in the user mcp.json. */
export function writeUserMcpServer(name: string, server: McpServer, path = join(getAgentDir(), 'mcp.json')): { path: string } {
  if (!SERVER_NAME.test(name)) throw new Error('Invalid server name');
  if (!isRecord(server)) throw new Error('Server configuration must be an object');
  const config: McpFile = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as McpFile)
    : { mcpServers: {} };
  const servers = { ...(config.mcpServers ?? {}) };
  servers[name] = server;
  const next: McpFile = { ...config, mcpServers: servers };
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
  return { path };
}

/** Atomic removal of one server entry from the user mcp.json. */
export function deleteUserMcpServer(name: string, path = join(getAgentDir(), 'mcp.json')): { path: string } {
  if (!SERVER_NAME.test(name)) throw new Error('Invalid server name');
  if (!existsSync(path)) throw new Error('MCP server was not found');
  const config = JSON.parse(readFileSync(path, 'utf8')) as McpFile;
  const servers = { ...(config.mcpServers ?? {}) };
  if (!(name in servers)) throw new Error('MCP server was not found');
  delete servers[name];
  const next: McpFile = { ...config, mcpServers: servers };
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
  return { path };
}

/** Convert a native omp server config into the chamber McpServerItem shape. */
export function nativeToServerItem(name: string, config: McpServer, index: number, enabled: boolean) {
  const isHttp = typeof config.url === 'string';
  const envRecord = isRecord(config.env) ? (config.env as Record<string, unknown>) : {};
  return {
    id: `omp-user-${name}`,
    name,
    scope: 'every-project' as const,
    enabled,
    reachType: isHttp ? ('link' as const) : ('command' as const),
    commandArgs: isHttp
      ? [String(config.url)]
      : [String(config.command ?? ''), ...(Array.isArray(config.args) ? config.args.map(String) : [])].filter(Boolean),
    linkUrl: isHttp ? String(config.url) : undefined,
    envVars: Object.entries(envRecord).map(([key, value], i) => ({
      id: `env-${index}-${i}`,
      key,
      value: typeof value === 'string' ? value : String(value),
    })),
    status: undefined,
  };
}

const SENSITIVE_KEY = /(key|token|secret|password|credential)/i;

/** Redact env var values for display — the browser never sees raw credentials. */
export function redactEnvVars<T extends { key: string; value: string }>(envVars: T[]): T[] {
  return envVars.map((item) => (SENSITIVE_KEY.test(item.key) ? { ...item, value: '••••••••' } : item));
}
