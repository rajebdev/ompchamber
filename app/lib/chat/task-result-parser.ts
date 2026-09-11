export interface TaskResultMeta {
  lines?: string;
  size?: string;
}

export interface TaskResultFileItem {
  path: string;
  description?: string;
}

export interface TaskResultStructuredOutput {
  summary?: string;
  files?: TaskResultFileItem[];
  architecture?: string;
  report?: string;
  [key: string]: unknown;
}

export interface ParsedTaskNotice {
  intro: string;
  id?: string;
  agent?: string;
  status?: string;
  duration?: string;
  meta?: TaskResultMeta;
  rawOutput: string;
  formattedJson?: string;
  structuredOutput?: TaskResultStructuredOutput;
  outro?: string;
}

/**
 * Parses XML-style <task-result> embedded inside system notices.
 * Handles <meta lines="..." size="..." />, <output>{...}</output>, and trailing agent://, history:// URIs.
 */
export function parseTaskNotice(text: string): ParsedTaskNotice | null {
  if (!text) return null;
  const match = text.match(/([\s\S]*?)<task-result\b([^>]*)>([\s\S]*?)<\/task-result>([\s\S]*)/i);
  if (!match) return null;

  const intro = match[1].trim();
  const attrs = match[2];
  const innerBody = match[3].trim();
  const outro = match[4].trim();

  const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
  const agent = attrs.match(/\bagent=["']([^"']+)["']/i)?.[1];
  const status = attrs.match(/\bstatus=["']([^"']+)["']/i)?.[1];
  const duration = attrs.match(/\bduration=["']([^"']+)["']/i)?.[1];

  // Extract <meta ... />
  let meta: TaskResultMeta | undefined;
  const metaMatch = innerBody.match(/<meta\b([^>]*)\/?>/i);
  if (metaMatch) {
    const metaAttrs = metaMatch[1];
    const lines = metaAttrs.match(/\blines=["']([^"']+)["']/i)?.[1];
    const size = metaAttrs.match(/\bsize=["']([^"']+)["']/i)?.[1];
    if (lines || size) {
      meta = { lines, size };
    }
  }

  // Extract <output>...</output> or fall back to innerBody with <meta> stripped
  let rawOutput = '';
  const outputMatch = innerBody.match(/<output\b[^>]*>([\s\S]*?)<\/output>/i);
  if (outputMatch) {
    rawOutput = outputMatch[1].trim();
  } else {
    rawOutput = innerBody.replace(/<meta\b[^>]*\/?>/gi, '').trim();
  }

  // Attempt JSON parsing
  let structuredOutput: TaskResultStructuredOutput | undefined;
  let formattedJson: string | undefined;

  if (rawOutput.startsWith('{') || rawOutput.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawOutput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        structuredOutput = parsed as TaskResultStructuredOutput;
        formattedJson = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // Not valid JSON, keep as raw string
    }
  }

  return {
    intro: intro || (id ? `Background job ${id} completed` : 'System notice'),
    id,
    agent,
    status,
    duration,
    meta,
    rawOutput,
    formattedJson,
    structuredOutput,
    outro: outro || undefined,
  };
}
