/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BTW schema, kept out of `db.server.ts`'s bootstrap block so that file's
 * growth stays attributable (it was already at the ceiling before this
 * feature). Called once per database open, like the other migrations there.
 */

import type { DbClient } from '@/server/lib/db/client';

const BTW_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS btw_topics (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    provider TEXT,
    model_id TEXT,
    model_name TEXT,
    leaf_id TEXT,
    promoted_session_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_btw_topics_session ON btw_topics (session_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS btw_turns (
    topic_id TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    question TEXT NOT NULL DEFAULT '',
    answer TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (topic_id, turn_index)
  );
`;

/** Idempotent: side questions live beside the session they belong to. */
export async function ensureBtwSchema(db: DbClient): Promise<void> {
  await db.exec(BTW_SCHEMA_SQL);
}
