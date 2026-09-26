const state = {
  json: false,
  quiet: false,
};

/**
 * Store module-level output flags for the current process.
 */
export function configure({ json = false, quiet = false } = {}) {
  state.json = Boolean(json);
  state.quiet = Boolean(quiet);
}

export function isQuiet() {
  return state.quiet;
}

export function isJson() {
  return state.json;
}

function colorsEnabled() {
  return Bun.enableANSIColors;
}

function paint(open, close, text) {
  const value = String(text);
  if (!colorsEnabled()) {
    return value;
  }
  return `\u001b[${open}m${value}\u001b[${close}m`;
}

/**
 * ANSI helpers. Every entry is `(text) => string` and degrades to a plain
 * pass-through when Bun reports ANSI colors unsupported (non-TTY stdout,
 * NO_COLOR set, or FORCE_COLOR=0).
 */
export const color = {
  red: (text) => paint(31, 39, text),
  green: (text) => paint(32, 39, text),
  yellow: (text) => paint(33, 39, text),
  dim: (text) => paint(2, 22, text),
  bold: (text) => paint(1, 22, text),
};

/**
 * Write a line to stdout unless quiet mode is active.
 */
export function log(message) {
  if (state.quiet) {
    return;
  }
  process.stdout.write(`${message}\n`);
}

/**
 * Write a success line (green check prefix) to stdout unless quiet.
 */
export function ok(message) {
  if (state.quiet) {
    return;
  }
  process.stdout.write(`${color.green('\u2713')} ${message}\n`);
}

/**
 * Write a warning line to stderr. Never suppressed.
 */
export function warn(message) {
  process.stderr.write(`${message}\n`);
}

/**
 * Write an error line to stderr. Never suppressed.
 */
export function error(message) {
  process.stderr.write(`${message}\n`);
}

/**
 * Write a pretty-printed JSON document to stdout.
 */
export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Report a fatal error and terminate with the given exit code.
 */
export function fail(message, code = 1) {
  error(message);
  process.exit(code);
}

/**
 * Render a simple padded plain-text table for human output.
 *
 * Widths are measured with `Bun.stringWidth`, not `String.length`: `.length`
 * counts UTF-16 code units, so a CJK session title or an emoji reported a width
 * it does not render at and the whole table misaligned (verified: a 5-column
 * overcount on a Japanese title). `stringWidth` also ignores ANSI escapes, so a
 * coloured cell does not pad against its own escape bytes.
 */
export function formatTable(rows, headers = []) {
  const body = Array.isArray(rows) ? rows.map((row) => (Array.isArray(row) ? row : [row])) : [];
  const head = Array.isArray(headers) ? headers : [];
  const columns = Math.max(head.length, ...body.map((row) => row.length), 0);

  if (columns === 0) {
    return '';
  }

  const cellText = (row, i) => (row[i] === undefined || row[i] === null ? '' : String(row[i]));
  const widths = [];
  for (let i = 0; i < columns; i += 1) {
    let width = head[i] === undefined ? 0 : Bun.stringWidth(String(head[i]));
    for (const row of body) {
      const cellWidth = Bun.stringWidth(cellText(row, i));
      if (cellWidth > width) width = cellWidth;
    }
    widths[i] = width;
  }

  const renderRow = (row) =>
    widths
      .map((width, i) => {
        const cell = cellText(row, i);
        return cell + ' '.repeat(Math.max(0, width - Bun.stringWidth(cell)));
      })
      .join('  ')
      .trimEnd();

  const lines = [];
  if (head.length > 0) {
    lines.push(renderRow(head));
    lines.push(widths.map((width) => '-'.repeat(width)).join('  '));
  }
  for (const row of body) {
    lines.push(renderRow(row));
  }
  return lines.join('\n');
}
