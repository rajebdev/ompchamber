export interface DirEntry {
  indent: number;
  isDir: boolean;
  name: string;
  size?: string;
  time?: string;
}

export interface DirListingResult {
  isDirectory: boolean;
  entries: DirEntry[];
  notice?: string;
}

export function parseDirListing(text: string): DirListingResult {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { isDirectory: false, entries: [] };

  const firstLine = lines[0].trim();
  const hasTreePattern = lines.some((l) => l.trimStart().startsWith('- ') || l.trimStart().startsWith('├──') || l.trimStart().startsWith('└──'));
  if (firstLine !== '.' && !hasTreePattern) {
    return { isDirectory: false, entries: [] };
  }

  const entries: DirEntry[] = [];
  let notice: string | undefined;

  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      notice = line.slice(1, -1);
      continue;
    }
    if (line.trim() === '.') {
      entries.push({ indent: 0, isDir: true, name: '.' });
      continue;
    }

    const match = line.match(/^(\s*)-\s+([^\s]+)\s*(.*)$/);
    if (match) {
      const indent = Math.floor(match[1].length / 2);
      const rawName = match[2];
      const remainder = match[3].trim();
      const isDir = rawName.endsWith('/');
      const name = isDir ? rawName.slice(0, -1) : rawName;

      let size: string | undefined;
      let time: string | undefined;

      const remParts = remainder.split(/\s{2,}|\t+/).filter(Boolean);
      if (remParts.length === 2) {
        size = remParts[0];
        time = remParts[1];
      } else if (remParts.length === 1) {
        if (remParts[0].endsWith('ago')) time = remParts[0];
        else size = remParts[0];
      }

      entries.push({ indent, isDir, name, size, time });
    }
  }

  return { isDirectory: entries.length > 0, entries, notice };
}

export interface ParsedCodeLine {
  lineNum: number | string;
  code: string;
}

export interface ParsedCodeResult {
  lines: ParsedCodeLine[];
  cleanCode: string;
  hasLineNumbers: boolean;
}

export interface NumberedCodeOptions {
  startLine?: number;
  lineNumbers?: (number | string | null | undefined)[];
}

/**
 * Parses raw code output to detect and clean embedded line numbers (e.g. "1: export...", "10:  |...").
 * Ensures code indentation and line numbers align straight with mathematical precision.
 */
export function parseNumberedCode(rawText: string, options?: NumberedCodeOptions): ParsedCodeResult {
  const trimmedEnd = rawText.replace(/\r?\n$/, '');
  const rawLines = trimmedEnd.split(/\r?\n/);
  if (rawLines.length === 0) {
    return { lines: [], cleanCode: '', hasLineNumbers: false };
  }

  interface MatchItem {
    lineNum: number;
    rawLine: string;
    pipePrefixLen?: number;
  }

  const matches: (MatchItem | null)[] = [];
  let validColonCount = 0;
  let validPipeCount = 0;

  for (const line of rawLines) {
    if (!line.trim()) {
      matches.push(null);
      continue;
    }

    // Pattern 1: Digits followed by colon: e.g. "1: export", "10:  |", "  45: const"
    const colonMatch = line.match(/^(\s*(\d+):)/);
    if (colonMatch) {
      const num = parseInt(colonMatch[2], 10);
      matches.push({ lineNum: num, rawLine: line });
      validColonCount++;
      continue;
    }

    // Pattern 2: Digits followed by pipe/bar: e.g. "1 | export" or "  10 │ const"
    const pipeMatch = line.match(/^(\s*(\d+)\s*[|│][ \t]?)/);
    if (pipeMatch) {
      const num = parseInt(pipeMatch[2], 10);
      matches.push({ lineNum: num, rawLine: line, pipePrefixLen: pipeMatch[1].length });
      validPipeCount++;
      continue;
    }

    matches.push(null);
  }

  const nonEmptyLines = rawLines.filter((l) => l.trim().length > 0);
  const isPipeNumbered = validPipeCount >= 2 && validPipeCount >= nonEmptyLines.length * 0.7;
  const isColonNumbered =
    !isPipeNumbered &&
    validColonCount >= 2 &&
    validColonCount >= nonEmptyLines.length * 0.7 &&
    (() => {
      const nums = matches.filter((m): m is MatchItem => m !== null).map((m) => m.lineNum);
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] < nums[i - 1]) return false;
      }
      return true;
    })();

  if (!isPipeNumbered && !isColonNumbered) {
    // Un-numbered code
    const explicitNumbers = options?.lineNumbers;
    const startLine =
      typeof options?.startLine === 'number' && !isNaN(options.startLine) && options.startLine > 0
        ? options.startLine
        : 1;

    const lines: ParsedCodeLine[] = rawLines.map((code, idx) => {
      let lineNum: number | string;
      if (explicitNumbers && idx < explicitNumbers.length) {
        const item = explicitNumbers[idx];
        lineNum = item === null || item === undefined || item === '' ? '…' : item;
      } else {
        lineNum = startLine + idx;
      }
      return {
        lineNum,
        code,
      };
    });

    return {
      lines,
      cleanCode: rawLines.join('\n'),
      hasLineNumbers: Boolean((explicitNumbers && explicitNumbers.length > 0) || startLine > 1),
    };
  }

  // Handle pipe format
  if (isPipeNumbered) {
    let currentNum = matches.find((m) => m !== null)?.lineNum ?? 1;
    const lines: ParsedCodeLine[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const m = matches[i];
      if (!rawLine.trim()) {
        lines.push({ lineNum: currentNum, code: '' });
        currentNum++;
      } else if (m && m.pipePrefixLen !== undefined) {
        lines.push({ lineNum: m.lineNum, code: rawLine.slice(m.pipePrefixLen) });
        currentNum = m.lineNum + 1;
      } else {
        lines.push({ lineNum: currentNum, code: rawLine });
        currentNum++;
      }
    }
    return {
      lines,
      cleanCode: lines.map((l) => l.code).join('\n'),
      hasLineNumbers: true,
    };
  }

  // Handle colon format (e.g. "1: export...", "10:  |...")
  const validMatched = matches.filter((m): m is MatchItem => m !== null);
  const maxDigits = String(Math.max(...validMatched.map((m) => m.lineNum))).length;

  // Determine starting column of code:
  let prefixCol = maxDigits + 1;
  const nonEmptyMatched = validMatched.filter((m) => m.rawLine.length > prefixCol);
  if (nonEmptyMatched.length > 0 && nonEmptyMatched.every((m) => m.rawLine[prefixCol] === ' ' || m.rawLine[prefixCol] === '\t')) {
    prefixCol++;
  }

  let currentNum = validMatched[0]?.lineNum ?? 1;
  const lines: ParsedCodeLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const m = matches[i];

    if (!rawLine.trim()) {
      lines.push({ lineNum: currentNum, code: '' });
      currentNum++;
      continue;
    }

    if (m) {
      currentNum = m.lineNum;
      const code = rawLine.length <= prefixCol ? '' : rawLine.slice(prefixCol);
      lines.push({ lineNum: m.lineNum, code });
      currentNum = m.lineNum + 1;
    } else {
      lines.push({ lineNum: currentNum, code: rawLine });
      currentNum++;
    }
  }

  return {
    lines,
    cleanCode: lines.map((l) => l.code).join('\n'),
    hasLineNumbers: true,
  };
}
