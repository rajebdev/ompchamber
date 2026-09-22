/**
 * Command-line argument parsing for the OMPChamber CLI.
 *
 * Pure and side-effect free: it never throws, never exits and never writes
 * to a stream. Callers decide how to react to `unknown` flags.
 */

const BOOLEAN_LONG = new Set([
  'lan',
  'prod',
  'foreground',
  'no-daemon',
  'all',
  'follow',
  'check',
  'force',
  'no-restart',
  'json',
  'quiet',
  'help',
  'version',
]);

// Flags that set another option to a non-`true` value.
const NEGATED_LONG = {
  'no-daemon': { key: 'foreground', value: true },
  'no-restart': { key: 'restart', value: false },
};

const VALUE_LONG = new Set(['port', 'host', 'hostname', 'lines']);

const SHORT_TO_LONG = {
  p: 'port',
  n: 'lines',
  f: 'follow',
  c: 'check',
  q: 'quiet',
  h: 'help',
  v: 'version',
};

const SHORT_VALUE = new Set(['p', 'n']);

function toNumberOrNull(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function takeValue(tokens, index, inline) {
  if (typeof inline === 'string' && inline.length > 0) {
    return { value: inline, nextIndex: index };
  }
  const candidate = tokens[index + 1];
  if (typeof candidate === 'string' && !candidate.startsWith('-')) {
    return { value: candidate, nextIndex: index + 1 };
  }
  return { value: undefined, nextIndex: index };
}

/**
 * Parse `process.argv.slice(2)` into a command, positionals and options.
 */
export function parseArgs(argv) {
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  const options = {
    port: null,
    host: null,
    lan: false,
    prod: false,
    foreground: false,
    all: false,
    follow: false,
    check: false,
    force: false,
    restart: true,
    lines: null,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };
  const unknown = [];
  const nonFlags = [];

  const applyLong = (name, inline, index) => {
    if (name === 'port') {
      const { value, nextIndex } = takeValue(tokens, index, inline);
      options.port = toNumberOrNull(value);
      return nextIndex;
    }
    if (name === 'lines') {
      const { value, nextIndex } = takeValue(tokens, index, inline);
      options.lines = toNumberOrNull(value);
      return nextIndex;
    }
    if (name === 'host' || name === 'hostname') {
      const { value, nextIndex } = takeValue(tokens, index, inline);
      options.host = typeof value === 'string' ? value : null;
      return nextIndex;
    }
    const negated = NEGATED_LONG[name];
    if (negated) {
      options[negated.key] = negated.value;
      return index;
    }
    if (BOOLEAN_LONG.has(name)) {
      options[name] = true;
      return index;
    }
    unknown.push(`--${name}`);
    return index;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const arg = tokens[i];

    if (typeof arg !== 'string') {
      continue;
    }

    if (arg === '--') {
      for (let j = i + 1; j < tokens.length; j += 1) {
        nonFlags.push(tokens[j]);
      }
      break;
    }

    if (!arg.startsWith('-') || arg === '-') {
      nonFlags.push(arg);
      continue;
    }

    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      const inline = eq >= 0 ? arg.slice(eq + 1) : undefined;
      i = applyLong(name, inline, i);
      continue;
    }

    const body = arg.slice(1);
    const shortName = body[0];
    const attached = body.length > 1 ? body.slice(1) : undefined;
    const longName = SHORT_TO_LONG[shortName];

    if (!longName) {
      unknown.push(arg);
      continue;
    }

    if (SHORT_VALUE.has(shortName)) {
      const { value, nextIndex } = takeValue(tokens, i, attached);
      if (longName === 'port') {
        options.port = toNumberOrNull(value);
      } else {
        options.lines = toNumberOrNull(value);
      }
      i = nextIndex;
      continue;
    }

    if (attached !== undefined) {
      unknown.push(arg);
      continue;
    }

    options[longName] = true;
  }

  const command = nonFlags.length > 0 ? nonFlags[0] : null;
  const positionals = nonFlags.slice(1);

  return { command, positionals, options, unknown };
}

/**
 * Full multi-line help text. Returned (not printed) so the caller owns output.
 */
export function helpText() {
  return `OMPChamber - Developer web console and diagnostic chamber for AI Oh-My-Pi

USAGE:
  ompchamber [COMMAND] [OPTIONS]

COMMANDS:
  serve          Start the OMPChamber web server (default when no command is given)
  update         Update OMPChamber to the latest GitHub release
  stop           Stop running OMPChamber instances (every one, or --port <port>)
  restart        Stop and start again (every CLI-started instance, or --port <port>)
  status         Show running instances (every one, or --port <port>)
  logs           Print or follow server logs (every instance, or --port <port>)

OPTIONS:
  -p, --port <port>       Web server port (default: 3000); scopes status/stop/restart/logs
  --host <address>        Bind address (default: 127.0.0.1)
  --hostname <address>    Alias for --host
  --lan                   Bind to 0.0.0.0 for LAN access
  --prod                  Run the production build instead of the dev server
  --foreground            Run the server in the foreground (no daemon)
  --no-daemon             Alias for --foreground
  --all                   Explicit form of the default for stop/restart (every instance)
  -c, --check             Report whether a newer release exists without installing it
  --force                 Reinstall even when already up to date
  --no-restart            Do not restart a running instance after updating
  -f, --follow            Follow log output as it is written
  -n, --lines <count>     Number of log lines to print
  --json                  Emit machine-readable JSON output
  -q, --quiet             Suppress non-essential output
  -h, --help              Show this help
  -v, --version           Show the version

ENVIRONMENT:
  OMPCHAMBER_DATA_DIR     Override the data directory (default: ~/.ompchamber)
  OMPCHAMBER_PORT         Default web server port
  OMPCHAMBER_HOST         Default bind address
  OMPCHAMBER_OMP_BIN      Path to the omp binary (required; falls back to PATH)
  GITHUB_TOKEN            Raise the GitHub API rate limit for update checks

EXAMPLES:
  ompchamber                       # Start the server on the default port
  ompchamber serve --port 8080     # Start on port 8080
  ompchamber serve --lan           # Start and expose the server on the LAN
  ompchamber serve --prod          # Serve the production build
  ompchamber update --check        # Is a newer release available?
  ompchamber update                # Update, then restart a running instance
  ompchamber stop                  # Stop the running instance
  ompchamber restart               # Restart the server
  ompchamber status                # Show whether the server is running
  ompchamber logs -f -n 200        # Follow the last 200 log lines
`;
}
