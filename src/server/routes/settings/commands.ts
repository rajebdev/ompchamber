import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { methodNotAllowed } from '@/server/lib/route-adapter';
import { getDb } from '@/server/db.server';
import { DEFAULT_COMMANDS_LIST } from '@/client/data/settings/command';
import { isMockMode } from '@/server/mock.server';
import type { CommandItem } from '@/shared/types';
import { isRecord } from '@/shared/lib/util/guards';
import { createSettingsListStore } from '@/server/lib/db/settings-store';
import { runUtilityCommand } from '@/server/lib/omp/rpc/utility';

const commandsStore = createSettingsListStore<CommandItem>({
  key: 'omp_commands_settings',
  mockDefaults: DEFAULT_COMMANDS_LIST,
  idOf: (command) => command.id,
  singular: 'command',
  plural: 'commands',
});

/** Command sources the chamber surfaces in the composer (mcp_prompt is not user-typable). */
const AGENT_COMMAND_SOURCES: Record<string, true> = {
  builtin: true,
  skill: true,
  custom: true,
  extension: true,
  file: true,
};

/**
 * Live slash commands from the agent's `get_available_commands`, mapped into
 * the chamber's CommandItem. Aliases, subcommands and the argument hint ride
 * along: they are what the composer's `/` popup needs to behave like omp's own
 * editor (`/models` completing to the alias, `/fast ` offering on|off|status).
 * Anything malformed is dropped rather than trusted.
 */
function toLiveCommandItem(value: unknown): CommandItem | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name : '';
  if (!name) return null;
  if (typeof value.source !== 'string' || !AGENT_COMMAND_SOURCES[value.source]) return null;

  const aliases = Array.isArray(value.aliases)
    ? value.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.length > 0)
    : [];

  const hint = isRecord(value.input) && typeof value.input.hint === 'string' ? value.input.hint : undefined;

  const subcommands = Array.isArray(value.subcommands)
    ? value.subcommands.flatMap((sub) => {
        if (!isRecord(sub) || typeof sub.name !== 'string' || !sub.name) return [];
        return [{
          name: sub.name,
          ...(typeof sub.description === 'string' ? { description: sub.description } : {}),
          ...(typeof sub.usage === 'string' ? { usage: sub.usage } : {}),
        }];
      })
    : [];

  return {
    id: `omp-live-${name}`,
    name,
    description: typeof value.description === 'string' ? value.description : '',
    scope: 'user',
    template: `/${name}`,
    isBuiltIn: true,
    ...(aliases.length ? { aliases } : {}),
    ...(subcommands.length ? { subcommands } : {}),
    ...(hint ? { inputHint: hint } : {}),
  };
}

/** Read live agent commands (builtin/skill/custom/extension/file sources) via RPC. */
async function loadAgentCommands(): Promise<CommandItem[]> {
  try {
    const data = await runUtilityCommand<{ commands?: unknown }>({ type: 'get_available_commands' }, 30_000);
    if (!Array.isArray(data.commands)) return [];
    return data.commands.flatMap((command) => {
      const item = toLiveCommandItem(command);
      return item ? [item] : [];
    });
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
