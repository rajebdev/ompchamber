import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_AGENTS_LIST } from '@/data/agent-data';
import { isMockMode } from '@/mock.server';
import type { AgentItem } from '@/types';
import { discoverNativeAgents, deleteAgentDefinition, writeAgentDefinition } from '@/lib/omp/config/agents';

const SETTINGS_KEY = 'omp_agents';

/**
 * Convert a natively discovered omp agent into the chamber AgentItem shape.
 * Native agents are surfaced as read-only built-ins (isBuiltIn) so the UI
 * lists them alongside app-local custom agents without offering edits that
 * would silently not persist.
 */
function nativeToAgentItem(agent: ReturnType<typeof discoverNativeAgents>[number]): AgentItem & { sourceRoot: string } {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description || `Native omp agent (${agent.sourceRoot})`,
    scope: agent.sourceRoot === 'user' ? 'user' : 'project',
    mode: agent.mode,
    overrideModel: agent.overrideModel,
    thinkingVariant: agent.thinkingVariant,
    temperature: agent.temperature,
    topP: agent.topP,
    systemPrompt: agent.systemPrompt,
    isBuiltIn: true,
    sourceRoot: agent.sourceRoot,
  };
}

/** Merge native omp agents (disk discovery) with app-local custom agents. */
function mergeAgents(custom: AgentItem[]): Array<AgentItem & { sourceRoot?: string }> {
  const native = discoverNativeAgents().map(nativeToAgentItem);
  const nativeNames = new Set(native.map((a) => a.name.toLowerCase()));
  return [...native, ...custom.filter((a) => !nativeNames.has(a.name.toLowerCase()))];
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const includeNative = url.searchParams.get('native') === '1' || !isMockMode();
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

    if (includeNative && !mock) {
      return json({ agents: mergeAgents(agents), isMock: mock });
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
      if (id.startsWith('omp-')) {
        return json({ error: 'Native omp agents are read-only in chamber' }, { status: 403 });
      }

      const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
      let list: AgentItem[] = isMockMode() ? DEFAULT_AGENTS_LIST : [];
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

      // Native agent file write: { type: "write_native", fileName, ...definition }
      if (body.type === 'write_native') {
        if (isMockMode()) return json({ error: 'Native agent writes are unavailable in mock mode' }, { status: 400 });
        const written = writeAgentDefinition({
          fileName: String(body.fileName ?? ''),
          name: typeof body.name === 'string' ? body.name : undefined,
          description: typeof body.description === 'string' ? body.description : undefined,
          mode: typeof body.mode === 'string' ? body.mode : undefined,
          model: typeof body.model === 'string' ? body.model : undefined,
          thinking: typeof body.thinking === 'string' ? body.thinking : undefined,
          temperature: typeof body.temperature === 'number' ? body.temperature : null,
          topP: typeof body.topP === 'number' ? body.topP : null,
          tools: Array.isArray(body.tools) ? body.tools.map(String) : undefined,
          systemPrompt: String(body.systemPrompt ?? ''),
        });
        return json({ success: true, path: written.path, agents: mergeAgents([]) });
      }

      // Native agent file delete: { type: "delete_native", fileName }
      if (body.type === 'delete_native') {
        if (isMockMode()) return json({ error: 'Native agent deletes are unavailable in mock mode' }, { status: 400 });
        const removed = deleteAgentDefinition(String(body.fileName ?? ''));
        if (!removed) return json({ error: 'Native agent file not found' }, { status: 404 });
        return json({ success: true, agents: mergeAgents([]) });
      }

      let updatedAgents: AgentItem[] = [];

      if (Array.isArray(body)) {
        updatedAgents = body;
      } else if (Array.isArray(body.agents)) {
        updatedAgents = body.agents;
      } else if (body.agent) {
        if (typeof body.agent.id === 'string' && body.agent.id.startsWith('omp-')) {
          return json({ error: 'Native omp agents are read-only in chamber' }, { status: 403 });
        }
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let list: AgentItem[] = isMockMode() ? DEFAULT_AGENTS_LIST : [];
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
