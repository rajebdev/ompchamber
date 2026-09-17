import type { Database } from 'sqlite';

/**
 * The app shares a single SQLite connection (see `getDb()`), so raw
 * `BEGIN`…`COMMIT` blocks from concurrent requests collide with
 * `SQLITE_ERROR: cannot start a transaction within a transaction` — and the
 * loser's `ROLLBACK` would abort the winner's in-flight writes. This mutex
 * serializes transaction blocks process-wide; SQLite transactions are fast
 * enough that queueing is fine.
 */
let txLock: Promise<unknown> = Promise.resolve();

/** Run `fn` inside a BEGIN…COMMIT block, serialized across the process. */
export async function withTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  const run = txLock.then(async () => {
    await db.run('BEGIN');
    try {
      const result = await fn();
      await db.run('COMMIT');
      return result;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  });
  // Failed transactions must not poison the chain for later callers.
  txLock = run.catch(() => undefined);
  return run;
}
