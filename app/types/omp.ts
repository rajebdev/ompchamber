/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Domain types for the oh-my-pi discovery layer (`@/lib/omp`).
 *
 * These mirror the shapes omp-web uses for its sidebar (ManagedProject /
 * SessionInfo) so a future UI fork can consume them directly. They are
 * intentionally independent from the existing SQLite-backed types
 * (`WorkspaceFolderData` / `SessionItemData`).
 */

/** A workspace (project root) shown in the sidebar list. */
export interface OmpProject {
  /** Canonical absolute path of the project root. */
  path: string;
  /** ISO timestamp of the most recent explicit add (registered only). */
  addedAt?: string;
  /** Optional display-only workspace name (registered only). */
  alias?: string;
  /** Explicit sidebar position; lower values appear first (registered only). */
  sortOrder?: number;
  /** True when this project was discovered from session files on disk rather
   *  than registered in ~/.omp/agent/projects.json. */
  discovered: boolean;
}

/** A session summary — one sidebar row under a project. */
export interface OmpSession {
  /** Absolute path of the session .jsonl file. */
  path: string;
  id: string;
  /** Working directory the session ran in. */
  cwd: string;
  /** Display title (title-slot wins; falls back to header title). */
  name?: string;
  /** ISO timestamp of session creation (header timestamp). */
  created: string;
  /** ISO timestamp of last modification (file mtime). */
  modified: string;
  /** Prefix-derived lower bound of the message count. */
  messageCount: number;
  /** First user message text (truncated by the prefix window). */
  firstMessage: string;
  /** Parent session id when this session was forked/branched. */
  parentSessionId?: string;
  /** Resolved root of the repository the session's cwd belongs to. */
  projectRoot?: string;
}

/** Full sidebar payload — equivalent to omp-web's /api/projects + /api/sessions. */
export interface OmpSidebarData {
  projects: OmpProject[];
  sessions: OmpSession[];
  /** Path of the agent dir the data was read from (~/.omp/agent). */
  agentDir: string;
  /** True when the sessions root exists and was readable. */
  available: boolean;
  /** ISO timestamp of the read (client can use it as a refresh cursor). */
  generatedAt: string;
}
