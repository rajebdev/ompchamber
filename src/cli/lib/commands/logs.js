// `ompchamber logs` — print or follow the server log file.

import { findLiveInstance } from '@/cli/lib/runtime.js';
import { getLogFilePath } from '@/cli/lib/paths.js';
import { log, printJson, fail, isJson, isQuiet } from '@/cli/lib/output.js';
const DEFAULT_LINES = 50;
const FOLLOW_INTERVAL_MS = 300;

function resolvePort(options) {
  const raw = options?.port;
  if (raw !== null && raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const env = Bun.env.OMPCHAMBER_PORT;
  if (typeof env === 'string' && env.trim().length > 0) {
    const parsed = Number(env.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 3000;
}

function explicitPort(options) {
  const raw = options?.port;
  if (raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitLines(content) {
  const lines = content.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function writeLines(lines) {
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function followFile(filePath, initialCount) {
  const initial = await Bun.file(filePath).text();
  writeLines(splitLines(initial).slice(-initialCount));

  let position = Buffer.byteLength(initial, 'utf8');
  let running = true;
  const stop = () => { running = false; };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (running) {
      await sleep(FOLLOW_INTERVAL_MS);

      let size;
      try {
        size = (await Bun.file(filePath).stat()).size;
      } catch {
        continue;
      }
      if (size < position) position = 0;
      if (size === position) continue;

      const chunk = await Bun.file(filePath).slice(position, size).text();
      position = size;
      process.stdout.write(chunk);
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

export async function run(options) {
  const json = isJson();
  const quiet = isQuiet();
  const requested = explicitPort(options);
  const live = await findLiveInstance(requested);
  const logFile = live?.logFile ?? getLogFilePath(requested ?? resolvePort(options));

  if (!(await Bun.file(logFile).exists())) {
    fail(`No log file found at ${logFile}.\nStart the server first with \`ompchamber serve\`.`);
  }

  const requestedLines = Number(options?.lines);
  const lineCount = Number.isFinite(requestedLines) && requestedLines > 0
    ? Math.trunc(requestedLines)
    : DEFAULT_LINES;

  if (json) {
    printJson({ logFile, lines: splitLines(await Bun.file(logFile).text()).slice(-lineCount) });
    return;
  }

  if (!quiet) log(`Log file: ${logFile}`);

  if (options?.follow) {
    await followFile(logFile, lineCount);
    return;
  }

  writeLines(splitLines(await Bun.file(logFile).text()).slice(-lineCount));
}
