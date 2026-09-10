export interface DiffLine {
  type: 'add' | 'del' | 'context' | 'meta';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface SplitDiffRow {
  left?: {
    type: 'del' | 'context';
    text: string;
    lineNumber: number;
  };
  right?: {
    type: 'add' | 'context';
    text: string;
    lineNumber: number;
  };
  isMeta?: boolean;
  metaText?: string;
}

export function parseUnifiedDiff(rawDiff: string, ignoreWhitespace: boolean = false): {
  lines: DiffLine[];
  splitRows: SplitDiffRow[];
  additions: number;
  deletions: number;
} {
  const lines: DiffLine[] = [];
  const splitRows: SplitDiffRow[] = [];
  let additions = 0;
  let deletions = 0;

  if (!rawDiff || !rawDiff.trim()) {
    return { lines, splitRows, additions, deletions };
  }

  const rawLines = rawDiff.split(/\r?\n/);
  let oldCounter = 1;
  let newCounter = 1;

  // Buffer for pairing consecutive deletions and additions in split view
  let delBuffer: { text: string; lineNumber: number }[] = [];
  let addBuffer: { text: string; lineNumber: number }[] = [];

  const flushBuffers = () => {
    const maxLen = Math.max(delBuffer.length, addBuffer.length);
    for (let i = 0; i < maxLen; i++) {
      splitRows.push({
        left: delBuffer[i] ? { type: 'del', text: delBuffer[i].text, lineNumber: delBuffer[i].lineNumber } : undefined,
        right: addBuffer[i] ? { type: 'add', text: addBuffer[i].text, lineNumber: addBuffer[i].lineNumber } : undefined,
      });
    }
    delBuffer = [];
    addBuffer = [];
  };

  for (const rawLine of rawLines) {
    if (rawLine.startsWith('diff --git') || rawLine.startsWith('index ') || rawLine.startsWith('---') || rawLine.startsWith('+++')) {
      continue;
    }

    if (rawLine.startsWith('@@')) {
      flushBuffers();
      const match = rawLine.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldCounter = parseInt(match[1], 10);
        newCounter = parseInt(match[2], 10);
      }
      lines.push({ type: 'meta', text: rawLine });
      splitRows.push({ isMeta: true, metaText: rawLine });
      continue;
    }

    if (rawLine.startsWith('+')) {
      const text = rawLine.slice(1);
      const normalizedText = ignoreWhitespace ? text.trim() : text;
      additions++;
      lines.push({
        type: 'add',
        text: normalizedText,
        newLineNumber: newCounter,
      });
      addBuffer.push({ text: normalizedText, lineNumber: newCounter });
      newCounter++;
    } else if (rawLine.startsWith('-')) {
      const text = rawLine.slice(1);
      const normalizedText = ignoreWhitespace ? text.trim() : text;
      deletions++;
      lines.push({
        type: 'del',
        text: normalizedText,
        oldLineNumber: oldCounter,
      });
      delBuffer.push({ text: normalizedText, lineNumber: oldCounter });
      oldCounter++;
    } else {
      flushBuffers();
      const text = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
      const normalizedText = ignoreWhitespace ? text.trim() : text;
      lines.push({
        type: 'context',
        text: normalizedText,
        oldLineNumber: oldCounter,
        newLineNumber: newCounter,
      });
      splitRows.push({
        left: { type: 'context', text: normalizedText, lineNumber: oldCounter },
        right: { type: 'context', text: normalizedText, lineNumber: newCounter },
      });
      oldCounter++;
      newCounter++;
    }
  }

  flushBuffers();

  return { lines, splitRows, additions, deletions };
}
