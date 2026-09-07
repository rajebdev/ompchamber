import { json, type ActionFunctionArgs } from '@remix-run/node';
import fs from 'fs/promises';
import path from 'path';
import { isMockMode } from '@/mock.server';
import { getDefaultFsRoot, resolveRoot } from '@/lib/fs-root';

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const q = formData.get('q') as string;
  const replaceWith = formData.get('replaceWith') as string;
  const matchCase = formData.get('matchCase') === 'true';
  const wholeWord = formData.get('wholeWord') === 'true';
  const useRegex = formData.get('useRegex') === 'true';
  const fileToReplace = formData.get('file') as string; // Optional: specific file to replace in
  const filesString = formData.get('files') as string; // Comma separated list of files to replace in

  if (!q) {
    return json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const targetDir = await resolveRoot(formData.get('root') as string, getDefaultFsRoot(isMockMode()));
    let filesToProcess: string[] = [];

    if (fileToReplace) {
      filesToProcess = [fileToReplace];
    } else if (filesString) {
      filesToProcess = JSON.parse(filesString);
    } else {
       return json({ error: 'No files provided for replacement' }, { status: 400 });
    }

    // Build the regex for replacement
    let regexStr = useRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex if not using regex
    if (wholeWord) {
      regexStr = `\\b${regexStr}\\b`;
    }
    
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(regexStr, flags);

    const results = [];

    for (const relFile of filesToProcess) {
      // Prevent directory traversal
      if (relFile.includes('..') || relFile.startsWith('/')) continue;
      
      const fullPath = path.join(targetDir, relFile);
      
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        if (regex.test(content)) {
          const newContent = content.replace(regex, replaceWith || '');
          await fs.writeFile(fullPath, newContent, 'utf8');
          results.push({ file: relFile, status: 'success' });
        }
      } catch (err) {
        console.error(`Failed to replace in ${relFile}:`, err);
        results.push({ file: relFile, status: 'error' });
      }
    }

    return json({ success: true, results });
  } catch (error: any) {
    console.error(error);
    return json({ error: String(error) }, { status: 500 });
  }
}
