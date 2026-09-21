<p align="center">
  <img src="public/icon-512x512.png" alt="OMPChamber" width="180" height="180">
</p>

<h1 align="center">OMPChamber</h1>

<p align="center">
  Developer web console and diagnostic chamber for <b>AI Oh-My-Pi</b>.<br>
  Watch, steer and audit autonomous coding sessions from one paper-flat dashboard.
</p>

<p align="center">
  <a href="https://bun.sh"><img alt="Runtime: Bun 1.4" src="https://img.shields.io/badge/runtime-Bun%201.4-000000?logo=bun&logoColor=white"></a>
  <a href="https://elysiajs.com"><img alt="Server: Elysia 1.4" src="https://img.shields.io/badge/server-Elysia%201.4-6f42c1"></a>
  <a href="https://preactjs.com"><img alt="UI: Preact 10" src="https://img.shields.io/badge/UI-Preact%2010-673ab7?logo=preact&logoColor=white"></a>
  <a href="https://rsbuild.dev"><img alt="Build: Rsbuild 2" src="https://img.shields.io/badge/build-Rsbuild%202-eab308"></a>
  <a href="package.json"><img alt="Version: 0.3.0" src="https://img.shields.io/badge/version-0.3.0-3f3f46"></a>
</p>

<p align="center">
  <a href="AGENTS.md">Architecture</a> ·
  <a href="docs/MIGRATION-elysia-preact-rsbuild-bun.md">Migration guide</a> ·
  <a href="DESIGN.md">Design spec</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/rajebdev/ompchamber/issues">Issues</a>
</p>

---

### [Read the docs →](AGENTS.md)

## What is OMPChamber?

OMPChamber is the browser console for [Oh-My-Pi](https://github.com/rajebdev/ompchamber) (`omp`) agent
sessions. It is not a wrapper around a terminal — it reads omp's own session JSONL, project
registry, config and subagent transcripts, then folds them into one live view.

One Elysia process serves the API and the client bundle. The agent event stream is a first-class
WebSocket route on that same listener (SSE as fallback), so there is no second server to run and
no proxy to configure.

```bash
bun run src/server/index.ts          # API + WebSocket + static client on :3000
```

Every developer surface is a switchable right-hand panel — files, search, git, terminal, context
telemetry, browser (headless and your own), usage — and each one remembers its own width.

```bash
ompchamber                           # start the server (default command)
ompchamber serve --lan --prod        # expose on 0.0.0.0, serve the production build
ompchamber logs -f -n 200            # follow the server log
```

## Features

- **Live session timeline** — streaming thinking blocks, tool-call cards with structured
  renderers, provider/model metadata, stick-to-bottom scroll and a persistent message queue.
- **In-place undo** — rewind an omp session by truncating its JSONL, guarded by a confirmation
  step and reflected in the sidebar immediately.
- **Workspace sidebar** — folder → session tree backed by omp's project registry, with
  server-authoritative per-session stream status, search, sort and archive.
- **Editor + diff** — tabbed file editing and git diffs highlighted by Shiki with the
  `one-light` / `one-dark-pro` pair across 26+ extra languages.
- **Eight developer panels** — files, search (ripgrep-backed, streaming), git source control,
  Bun terminal, context & token telemetry, your browser, headless browser, usage.
- **Full omp settings surface** — OMP Engine config keys, providers, agents, behavior
  (`AGENTS.md` / `RULES.md`), slash commands, MCP servers with live connection tests, skills and
  the skills catalog, token usage and notifications.
- **Two data modes** — `MOCK=true` ships demo datasets for previews; `MOCK=false` runs purely on
  the real SQLite database and real workspace files.
- **Self-update** — `ompchamber update` installs the latest GitHub release (bun global or git
  checkout) and restarts a running instance; **About → Updates** does the same from the console.

## Install

OMPChamber is published to npm. It needs a Bun runtime, not Node:

> **Bun only** — the server imports `bun:sqlite` and `Bun.YAML`, both of which Node cannot load.
> `bun` 1.4 or newer is required.

```bash
bun add -g ompchamber     # puts the `ompchamber` command on your PATH
ompchamber serve --prod   # start the server on :3000
```

The published tarball carries the source, the CLI and the prebuilt client bundle, so there is no
build step after install — `serve` runs immediately. `npm install -g ompchamber` works too, because
the `ompchamber` bin is a Bun script: Bun still has to be on `PATH`.

### From source

```bash
git clone https://github.com/rajebdev/ompchamber.git
cd ompchamber
bun install
bun run build                        # dist/client — the only build artifact

bun run start                        # NODE_ENV=production bun run src/server/index.ts
bun link                             # then: ompchamber status
bun run src/cli/ompchamber.js status
```

> **Serve before you build?** Without `dist/client` the server answers `503` and prints the exact
> command to run — it never fails with a bare `500`.

### Updating

`ompchamber update` resolves the newest GitHub release, compares it with the version in
`package.json` and replaces the install in place:

```bash
ompchamber update --check        # report only: current version, latest release
ompchamber update                # install it, then restart a running instance
ompchamber update --force        # reinstall even when already up to date
```

How the install is replaced depends on how it was made. A **bun global** install is refreshed with
`bun add -g ompchamber@<version>`. A **git checkout** of this repository is fast-forwarded to the
release tag and rebuilt (`bun install`, `bun run build`). Uncommitted work is never merged over:
the update refuses and asks you to commit or stash first. An install owned by another package
manager is not touched — the command prints the exact command to run instead.

The same check runs from the console — **About → Updates** — and its Update button performs the
same install, then asks you to restart the server, because a running server cannot replace itself.

## CLI

`ompchamber [COMMAND] [OPTIONS]` — `serve` is the default command.

| Command | Purpose |
|---|---|
| `serve` | Start the web server (daemon by default) |
| `update` | Install the latest GitHub release, then restart a running instance |
| `stop` | Stop the running instance |
| `restart` | Stop, then start again |
| `status` | Report whether an instance is running |
| `logs` | Print or follow the server log |

| Option | Purpose |
|---|---|
| `-p, --port <port>` | Web server port (default `3000`) |
| `--host <address>` | Bind address (default `127.0.0.1`) |
| `--lan` | Bind to `0.0.0.0` for LAN access |
| `--prod` | Serve the production build instead of the dev server |
| `--foreground` | Run in the foreground (no daemon) |
| `--all` | Apply the command to every running instance |
| `-c, --check` | Report whether a newer release exists without installing it |
| `--force` | Reinstall even when already up to date |
| `--no-restart` | Do not restart a running instance after updating |
| `-f, --follow` / `-n, --lines <count>` | Tail the log, optionally from a line count |
| `--json` / `-q, --quiet` | Machine-readable output / suppress non-essential output |

## Configuration

Environment variables, read from `.env` (see [`.env.example`](.env.example)):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `localhost` | Server bind address |
| `MOCK` | `true` | `true` = demo datasets, `false` = real SQLite + workspace only |
| `SYNC_WORKSPACE` | `true` | Keep the workspace index in sync with disk |
| `OMPCHAMBER_DATA_DIR` | `~/.ompchamber` | CLI registry, logs and database root |
| `OMPCHAMBER_PORT` / `OMPCHAMBER_HOST` | — | Defaults for the CLI when no flag is passed |
| `OMPCHAMBER_DB_PATH` (`DB_PATH`) | `~/.ompchamber/db.sqlite` | SQLite database path |
| `OMPCHAMBER_DEV_SERVER` | `http://localhost:3100` | Rsbuild asset origin used in dev |
| `OMPCHAMBER_BUN` | — | Explicit Bun binary for the CLI to spawn |
| `PI_CONFIG_DIR` / `PI_CODING_AGENT_DIR` | `~/.omp` | Oh-My-Pi config root overrides |
| `OMP_WEB_OMP_BIN` | — | Explicit `omp` binary path |
| `SKILLS_API_URL` | `https://skills.sh` | Skills catalog source |
| `GITHUB_TOKEN` / `GH_TOKEN` | — | Raise the GitHub API rate limit for update checks |

Runtime state, sessions and settings live in SQLite (`~/.ompchamber/db.sqlite`), which is the
single source of truth for persisted settings.

## Architecture

```text
src/
├─ client/    Preact UI — zero React packages
│  ├─ components/   layout, workspace, settings, mobile, common
│  ├─ hooks/        chat, workspace, ui, browser, models, settings
│  ├─ data/         mock datasets, samples, themes, model + agent catalogs
│  └─ tailwind.css  theme tokens (--theme-ink, --theme-paper, …)
├─ server/    Bun-only — Elysia routes, SQLite, omp RPC bridge, fs/git/terminal
│  ├─ routes/       one plugin per domain, mounted in routes/index.ts
│  ├─ lib/          omp session/subagent/config, updates, browser runtime
│  └─ plugins/      SSR shell, static assets, compression, dev assets
├─ shared/    Imported by both — types, chat timeline folding, pure helpers
└─ cli/       ompchamber command (plain ESM, runs under Bun)
```

Non-obvious invariants worth reading before you edit:

- **`src/shared/**` must never import a `node:` builtin or `bun:sqlite`** — it also runs in the
  browser. Server-only helpers belong in `src/server/lib/**`.
- **Route modules keep the ported Remix shape** (`loader` for GET, `action` for mutations) so
  status codes stay identical; `action` owns method dispatch and returns its own `405`.
- **Every internal import uses the `@/` alias**, folders mirror component names in kebab-case, and
  every `.ts`/`.tsx` file stays under 350 lines.

[`AGENTS.md`](AGENTS.md) is the normative reference for all of the above.

## Development

```bash
bun run dev            # watched server + client rebuild
bun run dev:lan        # same, bound to the LAN
bun run dev:server     # server only (bun --hot)
bun run dev:client     # client only (rsbuild build --watch)
```

There is no HMR: the server reloads on save, the client bundle rebuilds, refresh the page.
`dist/client/index.html` is the shell for both dev and prod, so run `dev:client` at least once
after a clean checkout.

Verification gates, all mandatory:

```bash
bun run lint                                                  # tsc --noEmit
bunx tsc --noEmit --noUnusedLocals --noUnusedParameters        # no dead code
bun run build                                                 # production bundle
bun test                                                      # bun test
```

## Releasing

Publishing is driven by **GitHub releases**, never by a push
([`.github/workflows/publish.yml`](.github/workflows/publish.yml)):

```bash
bun pm version minor -m "chore(release): v%s"   # bump + commit + tag v0.3.0
git push origin main --tags
# then publish the release on GitHub → the workflow publishes to npm
```

The workflow checks out the released tag, installs, typechecks, builds `dist/client`, fails when the
tag and the `package.json` version disagree, then runs `bun publish`. Two things to set up once:

- Repo secret **`NPM_TOKEN`** — a granular npm access token with read/write on `ompchamber`.
- GitHub environment **`npm`** — created on the first run; add required reviewers there to gate a
  publish behind an approval.

A failed publish is retried from **Actions → Publish → Run workflow**, which leaves the release
itself untouched.

## License

No license file is included. The source is public on GitHub and published to npm, but all rights are
reserved by the author — no license is granted for redistribution or reuse.

See [CHANGELOG.md](CHANGELOG.md) for the release history.
