import path from 'path';
import os from 'os';
import fs from 'fs';
import { createDb, type DbClient } from '@/server/lib/db/client';
import { isMockMode } from '@/server/mock.server';
import { SAMPLE_TOOLS_SESSION_ID, getSampleToolsSession } from '@/client/data/samples/tools-session';
import { SAMPLE_DIALOGUE_SESSION_ID, getSampleDialogueSession } from '@/client/data/samples/dialogue-session';
import { SAMPLE_DEVICES_SESSION_ID, getSampleDevicesSession } from '@/client/data/samples/virtual-devices-session';
import { loadOmpSidebarData } from '@/server/lib/omp/session/reader';

let dbPromise: Promise<DbClient> | null = null;

/** SYNC_WORKSPACE env flag (default true when unset). When enabled in real
 *  mode, workspace folders are auto-created from discovered omp projects. */
export function isWorkspaceSyncEnabled(): boolean {
  const raw = (Bun.env.SYNC_WORKSPACE || '').trim().toLowerCase();
  if (raw === '') return true;
  return raw !== 'false' && raw !== '0' && raw !== 'off' && raw !== 'no';
}

export function getDatabasePath(): string {
  if (isMockMode()) {
    return path.join(process.cwd(), 'workspace.db');
  }

  const customPath = Bun.env.OMPCHAMBER_DB_PATH || Bun.env.DB_PATH;
  if (customPath) {
    const resolvedPath = customPath.startsWith('~')
      ? path.join(os.homedir(), customPath.slice(1))
      : path.resolve(customPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return resolvedPath;
  }

  const defaultDir = path.join(os.homedir(), '.ompchamber');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return path.join(defaultDir, 'db.sqlite');
}

export async function getDb(): Promise<DbClient> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const dbPath = getDatabasePath();
    const db = createDb(dbPath);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_expanded BOOLEAN DEFAULT 0,
        project_path TEXT,
        model TEXT DEFAULT 'Not selected',
        accent_color TEXT DEFAULT '',
        icon TEXT DEFAULT 'default',
        custom_icon_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES workspace_folders (id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id TEXT PRIMARY KEY,
        title TEXT,
        messages TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS deleted_workspaces (
        project_path TEXT PRIMARY KEY,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS archived_sessions (
        session_id TEXT PRIMARY KEY,
        archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS session_ui_state (
        session_id TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT '{}',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS queued_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        attachments TEXT NOT NULL DEFAULT '[]',
        provider TEXT,
        model_id TEXT,
        thinking_level TEXT,
        access_mode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_queued_messages_session ON queued_messages (session_id, position);

      CREATE TABLE IF NOT EXISTS session_stream_state (
        session_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const { migrateWorkspaceFolderColumns } = await import('@/shared/lib/workspace/schema-migrations');
    await migrateWorkspaceFolderColumns(db);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        parent_id INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        is_expanded BOOLEAN DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions (id),
        FOREIGN KEY (parent_id) REFERENCES files (id)
      );
    `);

    // Seed data based on MOCK mode
    const folderCount = await db.get('SELECT COUNT(*) as count FROM workspace_folders');

    if (isMockMode()) {
      // MOCK=true: Seed demo workspace folders, sample chats, and session files
      if (folderCount.count === 0) {
        await db.exec(`
          INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES 
            (1, 'Chats', 1), 
            (2, 'Workspace', 1), 
            (3, 'drrealhandler', 1);
        `);
      }

      // Ensure ompchamber, Workspace, drrealhandler folders exist
      await db.run("INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES (1, 'ompchamber', 1)");
      await db.run("INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES (2, 'Workspace', 1)");
      await db.run("INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES (3, 'drrealhandler', 1)");
      await db.run("UPDATE workspace_folders SET name = 'ompchamber' WHERE id = 1");

      // Seed specific sessions matching screenshot
      const existingChats = await db.all("SELECT * FROM sessions WHERE folder_id = 1");
      const title1 = 'Cek stream subagent di ompweb';
      const title2 = 'Fitur Diff Panel dan Git Status Files';
      const title3 = 'Implementasi Saved State UI per Session ID';
      const title4 = 'Review loading indicator, model & intent title';
      const title5 = 'Status fitur streer dan queue';

      if (existingChats.length === 0) {
        await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (1, ?, 0)", [title1]);
        await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (1, ?, 0)", [title2]);
        await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (1, ?, 1)", [title3]);
        await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (1, ?, 0)", [title4]);
        await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (1, ?, 0)", [title5]);
      } else {
        await db.run("UPDATE sessions SET title = ? WHERE id = 1", [title1]);
        await db.run("UPDATE sessions SET title = ? WHERE id = 2", [title2]);
        await db.run("UPDATE sessions SET title = ? WHERE id = 3", [title3]);
        await db.run("UPDATE sessions SET title = ? WHERE id = 4", [title4]);
        await db.run("UPDATE sessions SET title = ? WHERE id = 5", [title5]);
        await db.run("UPDATE sessions SET is_active = 0 WHERE folder_id = 1");
        await db.run("UPDATE sessions SET is_active = 1 WHERE id = 3");
      }

      // Pre-seed sample sessions data
      try {
        const s1 = getSampleToolsSession();
        await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', ['1', s1.title, JSON.stringify(s1.messages)]);
        await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [SAMPLE_TOOLS_SESSION_ID, s1.title, JSON.stringify(s1.messages)]);

        const s2 = getSampleDialogueSession();
        await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', ['2', s2.title, JSON.stringify(s2.messages)]);
        await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [SAMPLE_DIALOGUE_SESSION_ID, s2.title, JSON.stringify(s2.messages)]);

        const s3 = getSampleDevicesSession();
        await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', ['3', s3.title, JSON.stringify(s3.messages)]);
        await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [SAMPLE_DEVICES_SESSION_ID, s3.title, JSON.stringify(s3.messages)]);
        const s3Row = await db.get("SELECT id FROM sessions WHERE folder_id = 1 AND title = ?", [title3]);
        if (s3Row) {
          await db.run('INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', [String(s3Row.id), s3.title, JSON.stringify(s3.messages)]);
        }
      } catch (e) {
        console.error('Failed to pre-seed sample sessions:', e);
      }

      const existingWorkspace = await db.all("SELECT * FROM sessions WHERE folder_id = 2");
      if (existingWorkspace.length === 0) {
        const workspaceTitles = [
          'History Commit 2026-09-05 23:00',
          'History Commit 2026-09-04 23:00',
          'History Commit 2026-09-03 23:00',
          'Error SMSC latency pada jns6.5 smppv2',
          'Penyebab provider_submit_status=-1 di jns6.5 Smartfren SMPP',
          'jns6.5 filevalidator error Mask Code di Release',
          'Union query transaksi 202607 dan 202606'
        ];
        for (const t of workspaceTitles) {
          await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (2, ?, 0)", [t]);
        }
      }

      const existingDrreal = await db.all("SELECT * FROM sessions WHERE folder_id = 3");
      if (existingDrreal.length === 0) {
        const drrealTitles = [
          'Buat branch feat/add-provider-err-telco-to-dr-smpp',
          'Update wiki v1.5.0 & testing dari add-configurabel',
          'Konfigurasi rute DR SMPP via config lookup',
          'drrealhandler update v1.5.0',
          'Gitlab wiki clone isi kosong'
        ];
        for (const t of drrealTitles) {
          await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (3, ?, 0)", [t]);
        }
      }

      // Add random sessions if we don't have enough to demonstrate the UI
      const sessionCount = await db.get('SELECT COUNT(*) as count FROM sessions');
      if (sessionCount.count < 15) {
        const titles = [
          'Fix header styling issue', 'Implement authentication flow', 'Setup CI/CD pipeline',
          'Debug database connection', 'Update README.md docs', 'Refactor UI components'
        ];
        
        for (let i = 1; i <= 3; i++) {
          const numSessions = 3;
          for (let j = 0; j < numSessions; j++) {
            const title = titles[Math.floor(Math.random() * titles.length)] + ' #' + Math.floor(Math.random() * 1000);
            await db.run('INSERT INTO sessions (folder_id, title, is_active) VALUES (?, ?, 0)', [i, title]);
          }
        }
      }

      // Seed random files for all sessions if files table is empty
      const fileCount = await db.get('SELECT COUNT(*) as count FROM files');
      if (fileCount.count === 0) {
        const allSessions = await db.all('SELECT id FROM sessions');
        for (const session of allSessions) {
          // Create root folders
          const res = await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, NULL, ?, ?, ?)', [session.id, 'src', 'folder', 1]);
          const srcId = res.lastID;
          
          const res2 = await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, NULL, ?, ?, ?)', [session.id, 'components', 'folder', 0]);
          const componentsId = res2.lastID;

          // Create files in src
          await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, ?, ?, ?, ?)', [session.id, srcId, 'index.tsx', 'file', 0]);
          await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, ?, ?, ?, ?)', [session.id, srcId, 'App.tsx', 'file', 0]);
          await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, ?, ?, ?, ?)', [session.id, srcId, 'styles.css', 'file', 0]);

          // Create files in components
          await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, ?, ?, ?, ?)', [session.id, componentsId, 'Button.tsx', 'file', 0]);
          await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, ?, ?, ?, ?)', [session.id, componentsId, 'Header.tsx', 'file', 0]);
          
          // Some root files
          await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, NULL, ?, ?, ?)', [session.id, 'package.json', 'file', 0]);
          await db.run('INSERT INTO files (session_id, parent_id, name, type, is_expanded) VALUES (?, NULL, ?, ?, ?)', [session.id, 'README.md', 'file', 0]);
        }
      }
    } else {
      // MOCK=false (Real Data Mode): when SYNC_WORKSPACE is enabled (default),
      // auto-create workspace folders from discovered omp projects. User-made
      // folders are never deleted; only additive sync.
      if (isWorkspaceSyncEnabled()) {
        try {
          await syncWorkspaceFoldersWithOmp(db);
        } catch (err) {
          // Discovery must never block app startup.
          console.error('OMP workspace sync failed:', err);
        }
      }
    }

    const { migrateLegacyProjectSettings } = await import('@/shared/lib/workspace/project-settings-migration');
    await migrateLegacyProjectSettings(db);

    return db;
  })();

  return dbPromise;
}

/**
 * Additive-only folder ↔ omp project sync: creates a workspace folder for
 * every project discovered from ~/.omp/agent (folder name = lowercase
 * basename, bound via project_path). It never modifies or deletes existing
 * user data — no renames, no re-binding of unbound folders — and it skips
 * projects the user has explicitly deleted (tombstoned in
 * `deleted_workspaces`), so a deleted workspace stays deleted.
 */
async function syncWorkspaceFoldersWithOmp(db: DbClient): Promise<void> {
  const { orderedOmpProjects, projectDisplayName } = await import('@/shared/lib/omp/session/sidebar');

  const data = await loadOmpSidebarData();
  const existing = await db.all('SELECT id, name, project_path FROM workspace_folders');  const tombstoned = await db.all('SELECT project_path FROM deleted_workspaces');

  const byPath = new Set(existing.map((r) => r.project_path).filter(Boolean));
  const usedNames = new Set(existing.map((r) => (r.name as string).toLowerCase()));
  const deletedPaths = new Set(tombstoned.map((r) => r.project_path as string));

  for (const project of orderedOmpProjects(data)) {
    if (deletedPaths.has(project.path)) continue;
    if (byPath.has(project.path)) continue;

    const name = projectDisplayName(project);
    let candidate = name;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${name}-${suffix++}`;
    }
    usedNames.add(candidate);
    await db.run(
      'INSERT INTO workspace_folders (name, is_expanded, project_path) VALUES (?, 1, ?)',
      [candidate, project.path],
    );
  }
}
