/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Database lifecycle for OMPChamber: resolve the SQLite path, open the
 * `bun:sqlite` client once, bootstrap the schema, and seed demo data in mock
 * mode. The DDL lives in `./db/schema`, the mock presets in `./db/seed` and
 * the workspace discovery sync in `./db/workspace-sync`.
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { createDb, type DbClient } from '@/server/lib/db/client';
import { initSchema } from '@/server/lib/db/schema';
import { seedMockData } from '@/server/lib/db/seed';
import { syncWorkspaceFoldersFromDiscovery } from '@/server/lib/db/workspace-sync';
import { isMockMode } from '@/server/mock.server';
import { pathExists } from '@/server/lib/omp/core/paths';
import { migrateLegacyProjectSettings } from '@/shared/lib/workspace/project-settings-migration';

let dbPromise: Promise<DbClient> | null = null;
/** Resolved handle cached by getDb(); promise callbacks never run sync, so
 *  hot paths unwrap through `getDbSync` instead of awaiting. */
let dbResolved: DbClient | null = null;

export async function getDatabasePath(): Promise<string> {
  if (isMockMode()) {
    return path.join(process.cwd(), 'workspace.db');
  }

  const customPath = Bun.env.OMPCHAMBER_DB_PATH || Bun.env.DB_PATH;
  if (customPath) {
    const resolvedPath = customPath.startsWith('~')
      ? path.join(os.homedir(), customPath.slice(1))
      : path.resolve(customPath);
    const dir = path.dirname(resolvedPath);
    if (!(await pathExists(dir))) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    return resolvedPath;
  }

  const defaultDir = path.join(os.homedir(), '.ompchamber');
  if (!(await pathExists(defaultDir))) {
    await fs.promises.mkdir(defaultDir, { recursive: true });
  }
  return path.join(defaultDir, 'db.sqlite');
}

export async function getDb(): Promise<DbClient> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const dbPath = await getDatabasePath();
    const db = createDb(dbPath);

    await initSchema(db);

    // Seed data based on MOCK mode
    if (isMockMode()) {
      // MOCK=true: demo workspace folders, sample chats, and session files
      await seedMockData(db);
    } else {
      // MOCK=false (Real Data Mode): when SYNC_WORKSPACE is enabled (default),
      // auto-create workspace folders from discovered omp projects. User-made
      // folders are never deleted; only additive sync.
      await syncWorkspaceFoldersFromDiscovery(db);
    }

    await migrateLegacyProjectSettings(db);

    dbResolved = db;
    return db;
  })();

  return dbPromise;
}

/**
 * Synchronous handle for hot paths needing raw sync transactions
 * (`bun:sqlite` is sync, so BEGIN…COMMIT cannot interleave with another
 * request). The server initializes the db at startup; anything earlier must
 * use `getDb()`.
 */
export function getDbSync(): DbClient {
  if (!dbResolved) throw new Error('Database not initialized — call getDb() first');
  return dbResolved;
}
