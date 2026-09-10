import { exec } from 'child_process';
import util from 'util';
import type { GitCommit } from '@/types/git';
import { SAMPLE_GIT_COMMITS } from '@/data/mock/git-commits';

const execAsync = util.promisify(exec);

export function parseGitLogOutput(stdout: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const lines = stdout.split('\n');
  let currentCommit: GitCommit | null = null;

  for (const line of lines) {
    if (line.startsWith('COMMIT_SPLIT|~|')) {
      if (currentCommit) {
        commits.push(currentCommit);
      }
      const parts = line.split('|~|');
      const hash = parts[1] || '';
      const shortHash = parts[2] || hash.slice(0, 8);
      const author = parts[3] || 'Unknown';
      const date = parts[4] || '';
      const message = parts[5] || '';
      const refStr = parts[6] || '';
      const parentStr = parts[7] || '';

      const refs = refStr
        ? refStr
            .split(',')
            .map(r => r.trim())
            .filter(Boolean)
        : [];
      const parents = parentStr
        ? parentStr
            .split(/\s+/)
            .map(p => p.trim())
            .filter(Boolean)
        : [];

      currentCommit = {
        hash,
        shortHash,
        author,
        date,
        message,
        refs,
        parents,
        files: [],
      };
    } else if (currentCommit && line.trim()) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        const file = parts[2].trim();
        const status = deletions > 0 && additions === 0 ? 'D' : additions > 0 && deletions === 0 ? 'A' : 'M';
        currentCommit.files?.push({
          file,
          status,
          additions,
          deletions,
        });
      }
    }
  }

  if (currentCommit) {
    commits.push(currentCommit);
  }

  return commits.length > 0 ? commits : SAMPLE_GIT_COMMITS;
}

export async function fetchGitCommits(targetDir: string): Promise<GitCommit[]> {
  try {
    const { stdout } = await execAsync(
      `git log -n 50 --numstat --date-order --pretty=format:"COMMIT_SPLIT|~|%H|~|%h|~|%an|~|%ad|~|%s|~|%D|~|%p" --date=format:"%b %d, %Y, %I:%M %p"`,
      { cwd: targetDir, timeout: 15000 }
    );
    return parseGitLogOutput(stdout);
  } catch {
    return SAMPLE_GIT_COMMITS;
  }
}

export async function fetchFileDiff(targetDir: string, hash: string, file: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git show --format="" "${hash}" -- "${file}"`, {
      cwd: targetDir,
      timeout: 10000,
    });
    if (stdout.trim()) return stdout;
  } catch {
    // Fall back to sample diff if available
  }

  const sample = SAMPLE_GIT_COMMITS.find(c => c.hash === hash || c.shortHash === hash);
  const sampleFile = sample?.files?.find(f => f.file === file);
  if (sampleFile?.diff) return sampleFile.diff;

  return `@@ -1,5 +1,6 @@\n // File: ${file}\n+ // Updated in commit ${hash.slice(0, 8)}\n  export default {};`;
}
