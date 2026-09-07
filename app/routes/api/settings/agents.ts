import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_AGENTS_LIST } from '@/data/agentData';
import { isMockMode } from '@/mock.server';
import type { AgentItem } from '@/types';

const SETTINGS_KEY = 'omp_agents';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
    const mock = isMockMode();
    let agents: AgentItem[] = mock ? DEFAULT_AGENTS_LIST : [];

    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          agents = parsed;
        }
      } catch {}
    } else if (mock) {
      // Seed to DB on initial access in mock mode
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(DEFAULT_AGENTS_LIST),
      ]);
    }

    return json({ agents, isMock: mock });
  } catch (error: any) {
    return json({ error: error.message, agents: isMockMode() ? DEFAULT_AGENTS_LIST : [], isMock: isMockMode() }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) {
        return json({ error: 'id is required' }, { status: 400 });
      }

      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
      let list: AgentItem[] = DEFAULT_AGENTS_LIST;
      if (row?.value) {
        try { list = JSON.parse(row.value); } catch {}
      }
      list = list.filter(a => a.id !== id);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(list),
      ]);
      return json({ success: true, agents: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      let updatedAgents: AgentItem[] = [];

      if (Array.isArray(body)) {
        updatedAgents = body;
      } else if (Array.isArray(body.agents)) {
        updatedAgents = body.agents;
      } else if (body.agent) {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let list: AgentItem[] = DEFAULT_AGENTS_LIST;
        if (row?.value) {
          try { list = JSON.parse(row.value); } catch {}
        }
        const idx = list.findIndex(a => a.id === body.agent.id);
        if (idx >= 0) {
          list[idx] = body.agent;
        } else {
          list.push(body.agent);
        }
        updatedAgents = list;
      }

      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(updatedAgents),
      ]);

      return json({ success: true, agents: updatedAgents });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
