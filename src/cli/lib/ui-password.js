// UI-password handling for `ompchamber serve`.
//
// There is no stored password. A password is supplied per invocation — through
// `--ui-password`, `OMPCHAMBER_UI_PASSWORD`, or an interactive prompt — and the
// server hashes it in memory for that process only. Nothing on disk can enable
// authentication, so a plain `bun run dev` never inherits a password someone set
// once and forgot about.
//
// The CLI's job is therefore narrow: resolve the value, and hand it to the
// spawned server through the environment (never argv, which is world-readable in
// `ps`). The server erases it as it reads it, before any child can inherit it.

import { generatePassword } from '@/shared/lib/auth/password';
import { UI_PASSWORD_ENV } from '@/shared/lib/auth/password';
import { isLoopbackHost } from '@/server/lib/lifecycle/probe';
import { log, warn } from '@/cli/lib/output.js';

/**
 * Read a line from the terminal without echoing it.
 *
 * Only used when stdin is a TTY: without one there is nothing to read, and a
 * prompt printed into a pipe would hang a scripted start. Raw mode is restored
 * on every exit path, including Ctrl+C, or the shell the CLI returns to would be
 * left with echo disabled.
 */
function promptForPassword(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      resolve(null);
      return;
    }

    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const finish = (result) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(result);
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish(value.length > 0 ? value : null);
          return;
        }
        if (char === '\u0003') {
          // Ctrl+C: abandon the prompt rather than starting unauthenticated by
          // accident, which is what an empty read would look like.
          finish(null);
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
      // Echo only the length, never the characters.
      process.stdout.write(`\r${question}${'*'.repeat(value.length)}`);
    };

    stdin.on('data', onData);
  });
}

/**
 * The password this start should enforce, and where it came from.
 *
 * `--no-ui-password` is an explicit opt-out and beats everything, so a shell
 * profile that exports `OMPCHAMBER_UI_PASSWORD` can still be overridden for one
 * run. `generated` is surfaced because a generated value is the one password the
 * user has never seen: it must be printed, and printed once.
 */
export async function resolveUiPassword(options) {
  if (options?.noUiPassword) return { password: null, generated: false, source: 'disabled' };

  const flag = options?.uiPassword;
  if (typeof flag === 'string' && flag.length > 0) return { password: flag, generated: false, source: 'flag' };
  if (flag === '') return { password: generatePassword(), generated: true, source: 'generated' };

  const fromEnv = (Bun.env[UI_PASSWORD_ENV] ?? '').trim();
  if (fromEnv.length > 0) return { password: fromEnv, generated: false, source: 'env' };

  const prompted = await promptForPassword('UI password (leave empty to skip): ');
  if (prompted) return { password: prompted, generated: false, source: 'prompt' };

  return { password: null, generated: false, source: 'none' };
}

/**
 * The environment a spawned server needs, with the password added when there is
 * one.
 *
 * The variable rather than argv: a value on the command line is readable by
 * every user on the machine through `ps`, and on Linux through
 * `/proc/<pid>/cmdline`. The server deletes it before spawning anything of its
 * own, so it survives only as long as the handover.
 */
export function uiPasswordEnv(resolved, baseEnv) {
  const env = { ...baseEnv };
  if (resolved?.password) env[UI_PASSWORD_ENV] = resolved.password;
  else delete env[UI_PASSWORD_ENV];
  return env;
}

/**
 * Announce a generated password, and warn about what is exposed.
 *
 * The TLS warning is the one that matters most, because its absence is what makes
 * a password feel safer than it is: with `--lan` and no TLS, the password crosses
 * the network in cleartext, so anyone able to read a packet reads it. That is
 * true whether or not a password is set, which is why the two warnings are
 * independent.
 */
export function reportUiAuth({ resolved, host, tls = false }) {
  if (resolved.generated) {
    // The only time this value is ever visible: it is hashed in the server's
    // memory and never stored, so there is no way to recover it later.
    log(`  UI password: ${resolved.password}`);
    log('  Save this password now — it is not stored anywhere, so it cannot be shown again.');
  } else if (resolved.source === 'flag') {
    log('  UI password: set from --ui-password');
  } else if (resolved.source === 'env') {
    log(`  UI password: set from ${UI_PASSWORD_ENV}`);
  } else if (resolved.source === 'prompt') {
    log('  UI password: set from the prompt');
  }

  if (isLoopbackHost(host)) return;

  if (tls) {
    log(`  TLS:         on — https://${host}:<port> (self-signed: your browser will warn once)`);
  } else if (resolved.password) {
    warn(
      `Warning: bound to ${host} with a password but NO TLS —`
      + ' the password and the session cookie cross your network in cleartext,'
      + ' readable by anything that can see the traffic.',
    );
    warn('  Add --tls for HTTPS, or reach it over SSH port-forwarding instead.');
    warn('  A tunnel also works and needs no certificate: cloudflared tunnel --url http://127.0.0.1:<port>');
  } else {
    warn(
      `Warning: bound to ${host}, which your network can reach, with no UI password set —`
      + ' anyone who can reach this port gets full access to this machine.',
    );
    warn('  Set one with --ui-password, or OMPCHAMBER_UI_PASSWORD.');
  }
}
