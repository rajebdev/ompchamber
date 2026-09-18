import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { getDb } from '@/server/db.server';
import { DEFAULT_COMMANDS_LIST } from '@/client/data/settings/command';
import { isMockMode } from '@/server/mock.server';
import type { CommandItem } from '@/shared/types';
import { runUtilityCommand } from '@/server/lib/omp/rpc/utility';

const SETTINGS_KEY = 'omp_commands_settings';

/** Read live agent commands (skill/custom/extension/file sources) via RPC. */
async function loadAgentCommands(): Promise<CommandItem[]> {
  try {
    const data = await runUtilityCommand<{ commands?: unknown }>({ type: 'get_available_commands' }, 30_000);
    const available = Array.isArray(data.commands) ? data.commands : [];
    const agentSources = new Set(['skill', 'custom', 'extension', 'file']);
    return available
      .filter((c) => agentSources.has((c as { source?: string })?.source ?? ''))
      .map((c) => {
        const command = c as { name?: string; description?: string; source?: string };
        const name = typeof command.name === 'string' ? command.name : '';
        return {
          id: `omp-live-${name}`,
          name,
          description: typeof command.description === 'string' ? command.description : '',
          scope: 'user' as const,
          template: `/${name}`,
          isBuiltIn: true,
        };
      })
      .filter((c) => c.name.length > 0);
  } catch {
    return [];
  }
}

/** Merge live agent commands ahead of app-local custom commands. */
async function mergeCommands(custom: CommandItem[]): Promise<CommandItem[]> {
  const live = await loadAgentCommands();
  const liveNames = new Set(live.map((c) => c.name.toLowerCase()));
  return [...live, ...custom.filter((c) => !liveNames.has(c.name.toLowerCase()))];
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
    const mock = isMockMode();
    let commands: CommandItem[] = mock ? DEFAULT_COMMANDS_LIST : [];

    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          commands = parsed;
        }
      } catch {}
    } else if (mock) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(DEFAULT_COMMANDS_LIST),
      ]);
    }

    const merged = mock ? commands : await mergeCommands(commands);
    return json({ commands: merged, isMock: mock });
  } catch (error: any) {
    const mock = isMockMode();
    return json({ error: error.message, commands: mock ? DEFAULT_COMMANDS_LIST : [], isMock: mock }, { status: 500 });
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
      let list: CommandItem[] = isMockMode() ? DEFAULT_COMMANDS_LIST : [];
      if (row?.value) {
        try { list = JSON.parse(row.value); } catch {}
      }
      list = list.filter(c => c.id !== id);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(list),
      ]);
      return json({ success: true, commands: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      let updatedCommands: CommandItem[] = [];

      if (Array.isArray(body)) {
        updatedCommands = body;
      } else if (Array.isArray(body.commands)) {
        updatedCommands = body.commands;
      } else if (body.command) {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let list: CommandItem[] = isMockMode() ? DEFAULT_COMMANDS_LIST : [];
        if (row?.value) {
          try { list = JSON.parse(row.value); } catch {}
        }
        const idx = list.findIndex(c => c.id === body.command.id);
        if (idx >= 0) {
          list[idx] = body.command;
        } else {
          list.push(body.command);
        }
        updatedCommands = list;
      }

      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(updatedCommands),
      ]);

      return json({ success: true, commands: updatedCommands });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
