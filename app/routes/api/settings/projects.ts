import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { DEFAULT_PROJECTS_LIST, AVAILABLE_PROJECT_MODELS, ACCENT_COLOR_OPTIONS } from '@/data/settings/project';
import { isMockMode } from '@/mock.server';
import type { ProjectConfigItem } from '@/types';

const SETTINGS_KEY = 'omp_projects_config';

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
    const mock = isMockMode();
    let projects: ProjectConfigItem[] = mock ? DEFAULT_PROJECTS_LIST : [];

    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          projects = parsed;
        }
      } catch {}
    } else if (mock) {
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(DEFAULT_PROJECTS_LIST),
      ]);
    }

    return json({
      projects,
      availableModels: AVAILABLE_PROJECT_MODELS,
      accentColorOptions: ACCENT_COLOR_OPTIONS,
      isMock: mock,
    });
  } catch (error: any) {
    const mock = isMockMode();
    return json({
      error: error.message,
      projects: mock ? DEFAULT_PROJECTS_LIST : [],
      availableModels: AVAILABLE_PROJECT_MODELS,
      accentColorOptions: ACCENT_COLOR_OPTIONS,
      isMock: mock,
    }, { status: 500 });
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
      let list: ProjectConfigItem[] = DEFAULT_PROJECTS_LIST;
      if (row?.value) {
        try { list = JSON.parse(row.value); } catch {}
      }
      list = list.filter(p => p.id !== id);
      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(list),
      ]);
      return json({ success: true, projects: list });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await request.json();
      let updatedProjects: ProjectConfigItem[] = [];

      if (Array.isArray(body)) {
        updatedProjects = body;
      } else if (Array.isArray(body.projects)) {
        updatedProjects = body.projects;
      } else if (body.project) {
        const row = await db.get('SELECT value FROM app_settings WHERE key = ?', [SETTINGS_KEY]);
        let list: ProjectConfigItem[] = DEFAULT_PROJECTS_LIST;
        if (row?.value) {
          try { list = JSON.parse(row.value); } catch {}
        }
        const idx = list.findIndex(p => p.id === body.project.id);
        if (idx >= 0) {
          list[idx] = body.project;
        } else {
          list.push(body.project);
        }
        updatedProjects = list;
      }

      await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [
        SETTINGS_KEY,
        JSON.stringify(updatedProjects),
      ]);

      return json({ success: true, projects: updatedProjects });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
