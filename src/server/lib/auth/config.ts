/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * UI-auth state for ONE run of the server.
 *
 * There is no stored password. A password is supplied per invocation — through
 * `--ui-password` or `OMPCHAMBER_UI_PASSWORD` — hashed in memory at boot, and
 * forgotten when the process exits. A plain `bun run dev` therefore runs with no
 * authentication, which is the default: a file on disk must not be able to
 * decide that a server the user started needs a credential they never set.
 *
 * The only thing persisted is the SESSION SIGNING SECRET, and it holds no
 * password. It is persisted for one reason: `bun run --hot` re-evaluates the
 * server entry on every save, so an in-memory secret would log the user out on
 * each edit — a dev loop that punishes the person using it. A file that only
 * signs cookies can be shared across restarts without ever being able to enable
 * authentication on its own.
 */

import fs from 'fs';

import { getAuthPath, getDataDir } from '@/server/lib/lifecycle/paths';

/** Shape of the persisted secret file. `version` guards a future change. */
export interface AuthSecretFile {
  version: 2;
  /** HMAC key for session tokens. Never a password, and never sufficient to log in. */
  sessionSecret: string;
  updatedAt: string;
}

/** The auth state of the running process. Null means authentication is off. */
export interface ActiveAuthConfig {
  /** argon2id hash of the password supplied for this run. */
  passwordHash: string;
  /** Signs session cookies; survives restarts so sessions do too. */
  sessionSecret: string;
}

/**
 * The stored session secret, or null when there is none.
 *
 * Any object carrying a non-empty `sessionSecret` is accepted, including the
 * retired v1 shape — reusing it means upgrading does not sign every logged-in
 * user out. The `passwordHash` that file may also carry is deliberately NOT
 * read: under this design a stored hash can never enable authentication.
 */
export async function readSessionSecret(): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await Bun.file(getAuthPath()).text());
    if (!parsed || typeof parsed !== 'object') return null;
    const secret = (parsed as Record<string, unknown>).sessionSecret;
    return typeof secret === 'string' && secret.length > 0 ? secret : null;
  } catch {
    // Absent, unreadable or malformed all mean "no secret to reuse": a fresh one
    // is generated, which is a logout rather than an error.
    return null;
  }
}

/**
 * Persist the session secret (temp file + rename, mode 0600). Returns false
 * instead of throwing when the data directory is not writable — the run
 * continues with the secret it generated, it just will not survive a restart.
 */
export async function writeSessionSecret(sessionSecret: string): Promise<boolean> {
  const target = getAuthPath();
  const temp = `${target}.${process.pid}.tmp`;
  const contents: AuthSecretFile = { version: 2, sessionSecret, updatedAt: new Date().toISOString() };
  try {
    fs.mkdirSync(getDataDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temp, `${JSON.stringify(contents, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temp, target);
    return true;
  } catch {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
    return false;
  }
}

/** Hash a password for this run. argon2id, ~70 ms — the brute-force floor. */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' });
}

/**
 * Verify a candidate against the run's hash.
 *
 * `Bun.password.verify` compares in constant time and answers false for a
 * malformed hash rather than throwing, so a corrupted value reads as "wrong
 * password" — the outcome the user can act on.
 */
export function verifyPassword(candidate: string, passwordHash: string): Promise<boolean> {
  return Bun.password.verify(candidate, passwordHash);
}
