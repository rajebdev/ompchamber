import { Database } from 'bun:sqlite';

/**
 * `bun:sqlite` compatibility client. The promise surface mirrors the retired
 * `sqlite` package so the 38 existing consumers keep compiling unchanged, and
 * the `T = any` defaults match that package's own signatures.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DbClient {
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<{ changes: number; lastID: number }>;
  exec(sql: string): Promise<void>;
  raw: Database;
}

/**
 * Open a database and return the compatibility client.
 *
 * Statements are prepared once and cached: `bun:sqlite` statements are
 * reusable, and the app issues thousands of small queries per request cycle
 * (sidebar scans, telemetry probes, file listings).
 */
export function createDb(path: string): DbClient {
  const raw = new Database(path, { create: true });
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');

  const stmts = new Map<string, ReturnType<Database['query']>>();
  const prep = (sql: string) => {
    let stmt = stmts.get(sql);
    if (!stmt) {
      stmt = raw.query(sql);
      stmts.set(sql, stmt);
    }
    return stmt;
  };

  return {
    async get<T>(sql: string, params: any[] = []) {
      return prep(sql).get(...(params as never[])) as T | undefined;
    },
    async all<T>(sql: string, params: any[] = []) {
      return prep(sql).all(...(params as never[])) as T[];
    },
    async run(sql: string, params: any[] = []) {
      const result = raw.run(sql, params as never);
      return { changes: result.changes, lastID: Number(result.lastInsertRowid) };
    },
    async exec(sql: string) {
      raw.exec(sql);
    },
    raw,
  };
}
