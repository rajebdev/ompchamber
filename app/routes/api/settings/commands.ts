import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_COMMANDS_LIST } from '@/data/settings/command';
import { isMockMode } from '@/mock.server';
import type { CommandItem } from '@/types';

const SETTINGS_KEY = 'omp_commands_settings';

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

    return json({ commands, isMock: mock });
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
      let list: CommandItem[] = DEFAULT_COMMANDS_LIST;
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
        let list: CommandItem[] = DEFAULT_COMMANDS_LIST;
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
