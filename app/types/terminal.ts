export interface TerminalLogItem {
  id: string;
  command: string;
  stdout?: string;
  stderr?: string;
  exitCode: number;
  durationMs?: number;
  timestamp: string;
  cwd?: string;
}

export interface TerminalRunResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  cwd: string;
  error?: string;
}
