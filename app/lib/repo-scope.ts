import path from 'path';
import fs from 'fs';

export function scopeToRepo(baseDir: string, repo: string | null | undefined): string {
  if (!repo || repo === '.') return baseDir;
  const scopeDir = path.resolve(baseDir, repo);
  if (scopeDir !== baseDir && !scopeDir.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid repo path');
  }
  if (!fs.existsSync(scopeDir) || !fs.statSync(scopeDir).isDirectory()) {
    throw new Error('Invalid repo path');
  }
  return scopeDir;
}
