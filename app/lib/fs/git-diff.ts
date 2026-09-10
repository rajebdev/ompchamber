import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import type { FileDiffData } from '@/types/git';

const execAsync = util.promisify(exec);

/**
 * Fetch git diff for a specific file in the working directory or index.
 */
export async function fetchWorkingFileDiff(
  targetDir: string,
  file: string,
  staged: boolean = false
): Promise<FileDiffData> {
  const fullPath = path.join(targetDir, file);
  let status = 'M';
  let diff = '';
  let oldContent = '';
  let newContent = '';
  let additions = 0;
  let deletions = 0;

  try {
    // Check porcelain status of this file
    const { stdout: statusOut } = await execAsync(`git status --porcelain=v1 -- "${file}"`, { cwd: targetDir });
    const statusLine = statusOut.trim();
    if (statusLine) {
      status = statusLine.slice(0, 2).trim() || 'M';
    }

    // Try reading current new content from disk if it exists
    if (fs.existsSync(fullPath)) {
      try {
        newContent = fs.readFileSync(fullPath, 'utf8');
      } catch {
        newContent = '';
      }
    }

    if (staged) {
      // Staged diff (index vs HEAD)
      try {
        const { stdout: diffOut } = await execAsync(`git diff --cached -- "${file}"`, { cwd: targetDir, timeout: 10000 });
        diff = diffOut;
      } catch (err: any) {
        if (err?.stdout) diff = err.stdout;
      }

      // Try reading old content from HEAD
      try {
        const { stdout: headOut } = await execAsync(`git show HEAD:"${file}"`, { cwd: targetDir, timeout: 5000 });
        oldContent = headOut;
      } catch {
        oldContent = '';
      }
    } else {
      // Unstaged diff (working copy vs index/HEAD)
      if (status === '??') {
        // Untracked file: create synthetic diff
        try {
          const { stdout: diffOut } = await execAsync(`git diff --no-index /dev/null "${file}"`, { cwd: targetDir, timeout: 10000 });
          diff = diffOut;
        } catch (err: any) {
          // git diff --no-index returns exit code 1 when diff exists
          if (err?.stdout) {
            diff = err.stdout;
          } else if (newContent) {
            const lines = newContent.split('\n');
            diff = `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(l => `+${l}`).join('\n');
          }
        }
        oldContent = '';
      } else {
        // Tracked modified or deleted file
        try {
          const { stdout: diffOut } = await execAsync(`git diff -- "${file}"`, { cwd: targetDir, timeout: 10000 });
          diff = diffOut;
        } catch (err: any) {
          if (err?.stdout) diff = err.stdout;
        }

        // If unstaged diff is empty (e.g. file is staged or modified vs HEAD), check git diff HEAD
        if (!diff.trim()) {
          try {
            const { stdout: headDiff } = await execAsync(`git diff HEAD -- "${file}"`, { cwd: targetDir, timeout: 10000 });
            if (headDiff.trim()) {
              diff = headDiff;
            }
          } catch (err: any) {
            if (err?.stdout) diff = err.stdout;
          }
        }

        // Try reading old content from index or HEAD
        try {
          const { stdout: indexOut } = await execAsync(`git show :0:"${file}"`, { cwd: targetDir, timeout: 5000 });
          oldContent = indexOut;
        } catch {
          try {
            const { stdout: headOut } = await execAsync(`git show HEAD:"${file}"`, { cwd: targetDir, timeout: 5000 });
            oldContent = headOut;
          } catch {
            oldContent = '';
          }
        }
      }
    }

    // Count additions and deletions from diff
    if (diff) {
      const diffLines = diff.split('\n');
      for (const line of diffLines) {
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
        if (line.startsWith('+')) additions++;
        else if (line.startsWith('-')) deletions++;
      }
    }

    return {
      file,
      diff: diff || (newContent ? `--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n ${newContent.slice(0, 100)}` : 'No differences found'),
      oldContent,
      newContent,
      staged,
      status,
      additions,
      deletions,
    };
  } catch (error: any) {
    return {
      file,
      diff: `// Unable to compute diff for ${file}: ${error?.message || 'Unknown error'}`,
      oldContent: '',
      newContent,
      staged,
      status: 'M',
      additions: 0,
      deletions: 0,
    };
  }
}
