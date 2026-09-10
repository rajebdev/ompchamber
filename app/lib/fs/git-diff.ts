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
  staged: boolean = false,
  requestedStatus?: string
): Promise<FileDiffData> {
  const cleanFile = file.replace(/^[./\\]+/, '').replace(/\\/g, '/');
  const fullPath = path.join(targetDir, cleanFile);
  let status = requestedStatus && requestedStatus.trim() ? requestedStatus.trim() : 'M';
  let diff = '';
  let oldContent = '';
  let newContent = '';
  let additions = 0;
  let deletions = 0;

  try {
    // Check porcelain status of this file
    try {
      const { stdout: statusOut } = await execAsync(`git status --porcelain=v1 -- "${cleanFile}"`, { cwd: targetDir });
      const statusLine = statusOut.trim();
      if (statusLine) {
        status = statusLine.slice(0, 2).trim() || status;
      }
    } catch {
      // ignore status check failure
    }

    // Try reading current new content from disk if it exists
    if (fs.existsSync(fullPath)) {
      try {
        newContent = fs.readFileSync(fullPath, 'utf8');
      } catch {
        newContent = '';
      }
    }

    // Read old content from index or HEAD
    try {
      const { stdout: headOut } = await execAsync(`git show HEAD:"${cleanFile}"`, { cwd: targetDir, timeout: 5000 });
      oldContent = headOut;
    } catch {
      try {
        const { stdout: indexOut } = await execAsync(`git show :0:"${cleanFile}"`, { cwd: targetDir, timeout: 5000 });
        oldContent = indexOut;
      } catch {
        oldContent = '';
      }
    }

    if (staged) {
      // 1. Try staged diff (index vs HEAD)
      try {
        const { stdout: diffOut } = await execAsync(`git diff --cached -- "${cleanFile}"`, { cwd: targetDir, timeout: 10000 });
        if (diffOut && diffOut.trim()) diff = diffOut;
      } catch (err: any) {
        if (err?.stdout && err.stdout.trim()) diff = err.stdout;
      }

      // 2. Fallback to git diff HEAD
      if (!diff.trim()) {
        try {
          const { stdout: headDiff } = await execAsync(`git diff HEAD -- "${cleanFile}"`, { cwd: targetDir, timeout: 10000 });
          if (headDiff && headDiff.trim()) diff = headDiff;
        } catch (err: any) {
          if (err?.stdout && err.stdout.trim()) diff = err.stdout;
        }
      }

      // 3. Fallback to unstaged diff
      if (!diff.trim()) {
        try {
          const { stdout: workingDiff } = await execAsync(`git diff -- "${cleanFile}"`, { cwd: targetDir, timeout: 10000 });
          if (workingDiff && workingDiff.trim()) diff = workingDiff;
        } catch (err: any) {
          if (err?.stdout && err.stdout.trim()) diff = err.stdout;
        }
      }
    } else {
      // Unstaged diff
      if (status === '??' || status === 'U' || status === '?') {
        // Untracked file: create synthetic diff
        try {
          const { stdout: diffOut } = await execAsync(`git diff --no-index /dev/null "${cleanFile}"`, { cwd: targetDir, timeout: 10000 });
          if (diffOut && diffOut.trim()) diff = diffOut;
        } catch (err: any) {
          if (err?.stdout && err.stdout.trim()) {
            diff = err.stdout;
          }
        }
      } else {
        // 1. Try working tree diff
        try {
          const { stdout: diffOut } = await execAsync(`git diff -- "${cleanFile}"`, { cwd: targetDir, timeout: 10000 });
          if (diffOut && diffOut.trim()) diff = diffOut;
        } catch (err: any) {
          if (err?.stdout && err.stdout.trim()) diff = err.stdout;
        }

        // 2. Fallback to git diff --cached (if file was staged already)
        if (!diff.trim()) {
          try {
            const { stdout: cachedDiff } = await execAsync(`git diff --cached -- "${cleanFile}"`, { cwd: targetDir, timeout: 10000 });
            if (cachedDiff && cachedDiff.trim()) diff = cachedDiff;
          } catch (err: any) {
            if (err?.stdout && err.stdout.trim()) diff = err.stdout;
          }
        }

        // 3. Fallback to git diff HEAD
        if (!diff.trim()) {
          try {
            const { stdout: headDiff } = await execAsync(`git diff HEAD -- "${cleanFile}"`, { cwd: targetDir, timeout: 10000 });
            if (headDiff && headDiff.trim()) diff = headDiff;
          } catch (err: any) {
            if (err?.stdout && err.stdout.trim()) diff = err.stdout;
          }
        }
      }
    }

    // 4. If git diff is still empty but new content exists:
    if (!diff.trim()) {
      if (oldContent && newContent && oldContent !== newContent) {
        // Synthesize diff from old and new lines
        const oldLines = oldContent.split(/\r?\n/);
        const newLines = newContent.split(/\r?\n/);
        const diffBody = [
          ...oldLines.map((l) => `-${l}`),
          ...newLines.map((l) => `+${l}`),
        ].join('\n');
        diff = `--- a/${cleanFile}\n+++ b/${cleanFile}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${diffBody}`;
      } else if (newContent) {
        const lines = newContent.split(/\r?\n/);
        const prefix = status === 'A' || status === '??' ? '+' : ' ';
        const diffBody = lines.map((l) => `${prefix}${l}`).join('\n');
        diff = `--- a/${cleanFile}\n+++ b/${cleanFile}\n@@ -1,${lines.length} +1,${lines.length} @@\n${diffBody}`;
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
      file: cleanFile,
      diff: diff || (newContent ? `--- a/${cleanFile}\n+++ b/${cleanFile}\n@@ -1,1 +1,1 @@\n ${newContent.slice(0, 100)}` : 'No differences found'),
      oldContent,
      newContent,
      staged,
      status,
      additions,
      deletions,
    };
  } catch (error: any) {
    return {
      file: cleanFile,
      diff: `// Unable to compute diff for ${cleanFile}: ${error?.message || 'Unknown error'}`,
      oldContent: '',
      newContent,
      staged,
      status: 'M',
      additions: 0,
      deletions: 0,
    };
  }
}
