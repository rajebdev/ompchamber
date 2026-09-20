import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { DEFAULT_COMMANDS_LIST } from '@/client/data/settings/command';
import { isMockMode } from '@/server/mock.server';
import type { CommandItem } from '@/shared/types';
import { createSettingsListStore } from '@/server/lib/db/settings-store';
import { runUtilityCommand } from '@/server/lib/omp/rpc/utility';

const commandsStore = createSettingsListStore<CommandItem>({
  key: 'omp_commands_settings',
  mockDefaults: DEFAULT_COMMANDS_LIST,
  idOf: (command) => command.id,
  singular: 'command',
  plural: 'commands',
});

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
    const mock = isMockMode();
    const commands = await commandsStore.read(db);
    const merged = mock ? commands : await mergeCommands(commands);
    return json({ commands: merged, isMock: mock });
  } catch (error: any) {
    const mock = isMockMode();
    return json({ error: error.message, commands: mock ? DEFAULT_COMMANDS_LIST : [], isMock: mock }, { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id is required' }, { status: 400 });

      const list = await commandsStore.remove(db, id);
      return json({ success: true, commands: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      const updatedCommands = await commandsStore.upsert(db, body);
      await commandsStore.write(db, updatedCommands);
      return json({ success: true, commands: updatedCommands });
    }

    return methodNotAllowed({ request, params });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
