import path from 'path';

export async function scopeToRepo(baseDir: string, repo: string | null | undefined): Promise<string> {
  if (!repo || repo === '.') return baseDir;
  const scopeDir = path.resolve(baseDir, repo);
  if (scopeDir !== baseDir && !scopeDir.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid repo path');
  }
  const stat = await Bun.file(scopeDir).stat().catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error('Invalid repo path');
  }
  return scopeDir;
}
