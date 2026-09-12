import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_MCP_SERVERS } from '@/data/settings/mcp';
import { isMockMode } from '@/mock.server';
import type { McpServerItem } from '@/types';
import {
  deleteUserMcpServer,
  nativeToServerItem,
  readUserMcpConfig,
  redactEnvVars,
  writeUserMcpServer,
} from '@/lib/omp/config/mcp';

const SETTINGS_KEY = 'omp_mcp_servers';

/** Merge native user servers (omp mcp.json) with app-local custom servers. */
function mergeServers(custom: McpServerItem[]): McpServerItem[] {
  const user = readUserMcpConfig();
  const native = user.servers.map((entry, index) =>
    nativeToServerItem(entry.name, entry.config, index, !user.disabledServers.includes(entry.name)),
  );
  const nativeItems: McpServerItem[] = native.map((item) => ({
    ...item,
    envVars: redactEnvVars(item.envVars),
  }));
  return [...nativeItems, ...custom.filter((s) => !nativeItems.some((n) => n.name.toLowerCase() === s.name.toLowerCase()))];
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope'); // "user" = include native omp config
    const includeNative = scope === 'user' || !isMockMode();
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
    const mock = isMockMode();
    let servers: McpServerItem[] = mock ? DEFAULT_MCP_SERVERS : [];

    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          servers = parsed;
        }
      } catch {}
    } else if (mock) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(DEFAULT_MCP_SERVERS),
      ]);
    }

    if (includeNative && !mock) {
      servers = mergeServers(servers);
    }

    return json({ servers, isMock: mock, nativePath: includeNative ? readUserMcpConfig().path : undefined });
  } catch (error: any) {
    const mock = isMockMode();
    return json({ error: error.message, servers: mock ? DEFAULT_MCP_SERVERS : [], isMock: mock }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });

      // Native omp server deletion (id prefix omp-user-) hits mcp.json directly.
      if (id.startsWith('omp-user-')) {
        const name = id.slice('omp-user-'.length);
        deleteUserMcpServer(name);
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let custom: McpServerItem[] = [];
        if (row?.value) {
          try { custom = JSON.parse(row.value); } catch {}
        }
        return json({ success: true, servers: mergeServers(custom) });
      }

      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
      let list: McpServerItem[] = DEFAULT_MCP_SERVERS;
      if (row?.value) {
        try { list = JSON.parse(row.value); } catch {}
      }
      list = list.filter(s => s.id !== id);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(list),
      ]);
      return json({ success: true, servers: isMockMode() ? list : mergeServers(list) });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();

      // Explicit native write: { scope: "user", name, server }
      if (body.scope === 'user' && typeof body.name === 'string' && body.server) {
        const commandArgs: string[] = Array.isArray(body.server.commandArgs) ? body.server.commandArgs.map(String) : [];
        const isLink = body.server.reachType === 'link' || typeof body.server.linkUrl === 'string';
        const nativeServer: Record<string, unknown> = isLink
          ? { url: String(body.server.linkUrl ?? commandArgs[0] ?? '') }
          : { command: commandArgs[0] ?? '', ...(commandArgs.length > 1 ? { args: commandArgs.slice(1) } : {}) };
        if (Array.isArray(body.server.envVars) && body.server.envVars.length > 0) {
          const env: Record<string, string> = {};
          for (const item of body.server.envVars) {
            if (item && typeof item.key === 'string' && typeof item.value === 'string' && item.value !== '••••••••') {
              env[item.key] = item.value;
            }
          }
          if (Object.keys(env).length > 0) nativeServer.env = env;
        }
        writeUserMcpServer(body.name, nativeServer);
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let custom: McpServerItem[] = [];
        if (row?.value) {
          try { custom = JSON.parse(row.value); } catch {}
        }
        return json({ success: true, servers: mergeServers(custom) });
      }

      let updatedServers: McpServerItem[] = [];

      if (Array.isArray(body)) {
        updatedServers = body;
      } else if (Array.isArray(body.servers)) {
        updatedServers = body.servers;
      } else if (body.server) {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let list: McpServerItem[] = DEFAULT_MCP_SERVERS;
        if (row?.value) {
          try { list = JSON.parse(row.value); } catch {}
        }
        const idx = list.findIndex(s => s.id === body.server.id);
        if (idx >= 0) {
          list[idx] = body.server;
        } else {
          list.push(body.server);
        }
        updatedServers = list;
      }

      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(updatedServers),
      ]);

      return json({ success: true, servers: isMockMode() ? updatedServers : mergeServers(updatedServers) });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
