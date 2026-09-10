/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { spawn } from 'child_process';
import type { resolveOmpBin } from '@/lib/omp/core/cli';

export interface RpcResponseFrame {
  type: 'response';
  id?: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
  code?: string;
}

export type RpcFrame = { type: string; [key: string]: unknown };

export class RpcCommandError extends Error {
  readonly command: string;
  readonly code?: string;

  constructor(command: string, message: string, code?: string) {
    super(message);
    this.name = 'RpcCommandError';
    this.command = command;
    this.code = code;
  }
}
export class RpcCommandTimeoutError extends Error {
  readonly command: string;
  readonly timeoutMs: number;

  constructor(command: string, timeoutMs: number, message?: string) {
    super(message ?? `RPC command ${command} timed out after ${timeoutMs}ms`);
    this.name = 'RpcCommandTimeoutError';
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

export interface PendingCommand {
  command: string;
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

export interface RpcProcessOptions {
  /** Working directory for the agent (also passed as --cwd). */
  cwd: string;
  /** Extra CLI args appended after the base `--mode rpc-ui --cwd <cwd>`. */
  extraArgs?: string[];
  /** Environment overrides merged over process.env. */
  env?: Record<string, string>;
  /** Called for every non-response frame (events, extension UI, subagent frames). */
  onFrame?: (frame: RpcFrame) => void;
  /** Called once when the child exits, after pending commands are rejected. */
  onExit?: (info: { code: number | null; signal: NodeJS.Signals | null; stderrTail: string }) => void;
  /** Injectable process boundary for deterministic transport tests. */
  dependencies?: {
    resolveOmpBin?: typeof resolveOmpBin;
    spawn?: typeof spawn;
  };
}

export const STDERR_TAIL_LIMIT = 8 * 1024;

/** Remove variables owned by the chamber host before starting an omp process. */
export function sanitizeProjectCommandEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const environment = { ...baseEnvironment };
  for (const name of Object.keys(environment)) {
    const comparableName = platform === 'win32' ? name.toUpperCase() : name;
    if (comparableName === 'PORT' || comparableName === 'NODE_ENV' || comparableName.startsWith('NEXT_')) {
      delete environment[name];
    }
  }
  return environment;
}
