import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (dbPromise) return dbPromise;
  
  dbPromise = (async () => {
    const db = await open({
      filename: path.join(process.cwd(), 'workspace.db'),
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_expanded BOOLEAN DEFAULT 0,
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
    `);

    // Attempt to add column to existing tables if it doesn't exist
    try {
      await db.exec('ALTER TABLE workspace_folders ADD COLUMN is_expanded BOOLEAN DEFAULT 0;');
    } catch (err) {
      // Column already exists, ignore
    }

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

    // Seed data if empty (using INSERT OR IGNORE to prevent UNIQUE constraint errors)
    const folderCount = await db.get('SELECT COUNT(*) as count FROM workspace_folders');
    if (folderCount.count === 0) {
      await db.exec(`
        INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES 
          (1, 'Chats', 1), 
          (2, 'Workspace', 1), 
          (3, 'drrealhandler', 1);
      `);
    }

    // Ensure Chats, Workspace, drrealhandler folders exist
    await db.run("INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES (1, 'Chats', 1)");
    await db.run("INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES (2, 'Workspace', 1)");
    await db.run("INSERT OR IGNORE INTO workspace_folders (id, name, is_expanded) VALUES (3, 'drrealhandler', 1)");

    // Seed specific sessions matching screenshot 2 if not present
    const existingChats = await db.all("SELECT * FROM sessions WHERE folder_id = 1");
    if (existingChats.length === 0) {
      await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (1, 'Halo greeting', 0)");
      await db.run("INSERT INTO sessions (folder_id, title, is_active) VALUES (1, 'TRD web list CRD dan PB/PMD', 0)");
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

    return db;
  })();

  return dbPromise;
}
