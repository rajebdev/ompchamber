import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_MCP_SERVERS } from '@/data/mcpData';
import { isMockMode } from '@/mock.server';
import type { McpServerItem } from '@/types';

const SETTINGS_KEY = 'omp_mcp_servers';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
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

    return json({ servers, isMock: mock });
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
      return json({ success: true, servers: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
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

      return json({ success: true, servers: updatedServers });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
