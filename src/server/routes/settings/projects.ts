import { json } from '@/server/lib/remix-compat';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { getDb } from '@/server/db.server';
import { ACCENT_COLOR_OPTIONS, AVAILABLE_PROJECT_MODELS } from '@/client/data/settings/project';
import { deleteWorkspaceFolder, parseFolderSettingsPatch, projectConfigFromFolder, updateWorkspaceFolder } from '@/shared/lib/workspace/project-settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function projectPatch(project: Record<string, unknown>) {
  return parseFolderSettingsPatch({
    name: project.name,
    projectPath: project.projectPath ?? project.path,
    model: project.model,
    accentColor: project.accentColor,
    icon: project.icon,
    customIconUrl: project.customIconUrl,
    isPinned: project.isPinned,
    isExpanded: project.isExpanded,
  });
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  try {
    const db = await getDb();
    const folders = await db.all('SELECT * FROM workspace_folders ORDER BY id ASC');
    const projects = folders.map(projectConfigFromFolder);

    return json({
      projects,
      availableModels: AVAILABLE_PROJECT_MODELS,
      accentColorOptions: ACCENT_COLOR_OPTIONS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load projects';
    return json({
      error: message,
      projects: [],
      availableModels: AVAILABLE_PROJECT_MODELS,
      accentColorOptions: ACCENT_COLOR_OPTIONS,
    }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const db = await getDb();

  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id');
    const folderId = id?.startsWith('folder-') ? id.slice('folder-'.length) : id;
    if (!folderId) return json({ error: 'id is required' }, { status: 400 });

    const deleted = await deleteWorkspaceFolder(db, folderId);
    if (!deleted) return json({ error: 'Workspace not found' }, { status: 404 });
    return json({ success: true });
  }

  if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'PATCH') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isRecord(body) || !isRecord(body.project)) {
    return json({ error: 'project is required' }, { status: 400 });
  }

  const project = body.project;
  const folderId = typeof project.folderId === 'number' ? String(project.folderId) : undefined;
  if (!folderId) return json({ error: 'project.folderId is required' }, { status: 400 });

  const updated = await updateWorkspaceFolder(db, folderId, projectPatch(project));
  if (!updated) {
    const folder = await db.get('SELECT id FROM workspace_folders WHERE id = ?', [folderId]);
    if (!folder) return json({ error: 'Workspace not found' }, { status: 404 });
  }

  const folder = await db.get('SELECT * FROM workspace_folders WHERE id = ?', [folderId]);
  return json({ success: true, project: folder ? projectConfigFromFolder(folder) : null });
}
