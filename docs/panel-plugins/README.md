# Panel Plugins

A panel plugin adds its own view to OMPChamber — a view in the right panel, or a
tab in the editor panel. **A plugin is a Preact + Bun package**, built the same
way this app builds itself, and the chamber serves its build output into a
sandboxed iframe with a small, capability-gated API.

You write TSX, import from `node_modules`, and get one self-contained output.
Preact is what this app renders with, so a panel is built from the same runtime
and the same hooks — and the bundle is small because Preact is.

Two packages are provided by the chamber itself:

| Import | What it gives you |
|---|---|
| `@ompchamber/plugin-sdk` | The bridge types, `acquirePanel()`, `assetUrl()`. |
| `@ompchamber/ui` | `PanelProvider` + the hooks. |
| `@ompchamber/ui/components` | `Panel`, `Field`, `FieldList`, `TextAreaField`, `Button`, `Empty`, `Note`. |
| `@ompchamber/ui/styles.css` | The kit's stylesheet, themed by `data-theme`. |

They are published on npm (`@ompchamber/plugin-sdk`, `@ompchamber/ui`), and the
chamber links them into a plugin's `node_modules` before building.

**Declare them as OPTIONAL PEER dependencies.** The manifest should name what the
code imports, and this is the only form that does so without breaking the install:

```json
{
  "dependencies": { "preact": "^10.29.8" },
  "peerDependencies": { "@ompchamber/plugin-sdk": "*", "@ompchamber/ui": "*" },
  "peerDependenciesMeta": {
    "@ompchamber/plugin-sdk": { "optional": true },
    "@ompchamber/ui": { "optional": true }
  }
}
```

Measured on Bun 1.4.2, with the package absent from the registry:

| Declaration | `bun install` |
|---|---|
| `dependencies` | **exit 1** — `failed to resolve` |
| `peerDependencies` | **exit 1** — same 404 |
| `peerDependencies` + `optional: true` | exit 0 |

So the choice is not between `dependencies` and peers — both fail the install
until the package is on npm, and a plugin cloned into the marketplace is built
before that is guaranteed. `optional: true` is what makes it work.

Two consequences worth knowing:

- **`optional` also silences a version mismatch.** A peer range the linked package
  cannot satisfy produces no warning (measured: `^99.0.0` against the link exits
  0). Keep the range loose (`*` or `^1`) and let the chamber's link decide — it
  provides a newer package by design.
- **This is the convention the ecosystem already uses.** React, Preact and every
  other host-provided runtime declares itself this way, so a plugin author
  recognises the shape and tooling treats it correctly.

## One marketplace

```
~/.ompchamber/marketplace/
├── marketplace.json              the catalog — what is registered
└── plugins/
    └── session-info/             a plugin (a Preact + Bun package)
        ├── package.json          manifest + build script + preact
        ├── tsconfig.json         jsxImportSource: "preact"
        ├── src/
        │   ├── index.html        the panel document
        │   ├── main.tsx          its Preact entry
        │   └── scratch.html      a second panel
        └── dist/                 the build output the chamber serves
            ├── index.html
            ├── index-<hash>.js
            └── index-<hash>.css
```

`dist/` is gitignored, so it is never committed: the chamber builds it. A
bundled plugin is built during the seed, and an installed one is built during the
install — either way the manifest's `entry` names a file inside `dist/`, and the
panel pane offers **Rebuild** whenever it is missing.

There is one marketplace, and it holds two kinds of plugin:

- **Bundled.** The defaults ship with the app in `<package>/marketplace/` and are
  copied into `~/.ompchamber/marketplace/` **once**, on first start. The copy is
  marker-guarded (`.seeded`), so a plugin you remove stays removed rather than
  being restored on the next boot.
- **Installed.** A git URL cloned into `plugins/` and registered in the catalog.
  Afterwards it is indistinguishable from a bundled one — same directory shape,
  same catalog entry, same scan.

The working copy lives in your data directory rather than inside the package
because a globally installed package sits in a read-only `node_modules` and the
update flow replaces it outright: a plugin installed there would vanish on the
next upgrade.

`OMPCHAMBER_MARKETPLACE_DIR` overrides the location (useful for testing).

## Building

The chamber builds a plugin with Bun — the same runtime the app itself runs on,
and the same bundler (`bun build`, `target: 'browser'`) it bundles its own client
with.

- TSX needs `"jsx": "react-jsx"` and `"jsxImportSource": "preact"` in the plugin's
  `tsconfig.json`. Without it Bun's transpiler emits `react/jsx-dev-runtime` and
  the build fails — a plugin may not rely on the app's own tsconfig.
- A plugin that imports `@ompchamber/ui/styles.css` needs
  `"allowArbitraryExtensions": true` in its tsconfig, or TypeScript refuses the
  side-effect import (`TS2882`). The kit ships the matching
  `styles.d.css.ts`; the build itself does not care either way.
- If `package.json` has a **`build` script**, that script runs. It wins, because a
  plugin may need a bundler pass the chamber knows nothing about (a framework, a
  template compiler).
- Otherwise the conventional entry is bundled directly: `src/index.html`,
  `src/index.ts(x)`, `src/index.js`, or `index.html`. A plain plugin needs no
  build script at all.
- **Dependencies are installed first** (`bun install --ignore-scripts`) when
  `package.json` declares any. `--ignore-scripts` because a postinstall would run
  arbitrary code on the SERVER, outside the sandbox the panel itself runs in.
- **`@ompchamber/*` is linked into the plugin's `node_modules`** before the
  build. Those packages are workspace links inside this checkout, so a plugin
  cloned into the marketplace cannot resolve them from its own install — `bun
  install` would have to fetch them from a registry that does not carry them.
  Symlinks, one per package, written after the install so it cannot delete them.
- **One Preact per bundle.** The linked UI kit resolves `preact` up from its own
  path, which in a checkout finds a SECOND copy beside the plugin's — and two
  copies means two option objects, so Preact's hooks die at render with
  `Cannot read properties of undefined (reading '__H')`. The kit's own
  `node_modules/preact` is therefore pointed at the plugin's copy.
- `dist/` is **replaced**, never merged, so a chunk the current source no longer
  emits cannot survive.
- Every entry the manifest names must exist after the build. One missing document
  fails the whole build, because the alternative is a plugin that reports as
  built while one of its panels 404s.

A plugin with no `package.json` is served as-is. That is deliberate: a
hand-written HTML plugin keeps working.

## Installing from a git URL

Settings → **Panel Plugins** → paste a URL → **Install**.

The repository root must carry a manifest — an `ompchamber` key in
`package.json` (the usual case for a package), or a standalone `ompchamber.json`.
Accepted sources are what `git clone` accepts: `https://`, `ssh://`, the
`git@host:path` form, and a local path.

The install is a shallow clone into a **staging directory outside `plugins/`**,
and it is moved into place only after its manifest validates. A clone that fails
halfway, or a repository that is not a plugin, therefore leaves the marketplace
exactly as it was instead of adding a directory the scan then reports as broken.
The destination name comes from the manifest's `id`, not from the URL — the
repository's name says nothing about the plugin's identity.

Install clones, **builds**, and only then registers. A package whose build fails
is left on disk — so **Rebuild** can fix it — but is not written to the catalog,
which is why the pane reports it as *not built* rather than as a broken install.

Installing writes two things, and **Remove** undoes both: the directory and the
catalog entry. Removing only the directory would leave the catalog naming a path
that no longer exists, which the scan reports as a fault — the pane showing your
own successful removal as an error.

## `marketplace.json`

The catalog. Every field is optional; an entry's `source` is not.

```json
{
  "name": "OMPChamber",
  "description": "Panels bundled with OMPChamber, plus the ones you install from a git URL.",
  "owner": { "name": "OMPChamber" },
  "plugins": [
    { "name": "session-info", "source": "plugins/session-info", "description": "…", "category": "utility" }
  ]
}
```

`source` is a path relative to the marketplace root, resolved under it — a `../`
segment or an absolute path is refused.

The catalog and the directory are independent, and **both directions matter**:

- A plugin present under `plugins/` but absent from the catalog **still loads**.
  That is what makes hand-copying a folder work.
- A catalog entry naming a directory that holds no plugin is **reported**, with
  its reason. That is what makes a failed install visible instead of silent.

## The manifest

A plugin's manifest is the `ompchamber` key in its `package.json`. A standalone
`ompchamber.json` is also accepted — for a plugin that is not a package, and for
a hand-written one — and is read first.

```json
{
  "name": "session-info",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bun build src/index.html src/scratch.html --outdir dist --target browser --minify"
  },
  "ompchamber": {
    "id": "session-info",
    "name": "Session Info",
    "version": "1.0.0",
    "panels": [
    {
      "id": "info",
      "title": "Session Info",
      "position": "right",
        "entry": "dist/index.html",
        "capabilities": ["theme", "session-state"],
        "minWidth": 300,
        "defaultFraction": 0.35
      },
      { "id": "scratch", "title": "Scratchpad", "position": "editor", "entry": "dist/scratch.html" }
    ]
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `[a-z0-9][a-z0-9._-]*`, ≤ 64 chars. The plugin's namespace. |
| `name` | yes | Shown in the activity-bar tooltip and the settings pane. |
| `version` | yes | Free-form string; displayed, not parsed. |
| `panels[].id` | yes | Unique within the plugin. |
| `panels[].title` | yes | The activity-bar tooltip / tab label. |
| `panels[].position` | yes | `"right"` or `"editor"`. |
| `panels[].entry` | yes | HTML file, relative to the plugin root — for a package, a file inside `dist/`. |
| `panels[].icon` | no | Image, relative to the plugin root. Omit for a default mark. |
| `panels[].minWidth` | no | Floor in px. Never below 320. |
| `panels[].defaultFraction` | no | Share of the panel group to open at. Clamped to 0.2–0.9. |
| `panels[].capabilities` | no | Defaults to `[]`. See below. |

One plugin can contribute several panels, in either position — `entry` is per
panel, so the views share the plugin's manifest and its assets.

A panel's UI id is `plugin:<plugin id>/<panel id>` — that is what the layout
stores, what the width map keys on, and what appears in the activity bar.

**Both `entry` and `icon` must stay inside the plugin directory.** An absolute
path or a `../` segment is refused at scan time and reported in the pane, because
those values become filesystem reads on the asset route.

## Isolation

A panel runs in an iframe with `sandbox="allow-scripts"` and **no**
`allow-same-origin`. That gives it an opaque origin, so inside the frame:

- `parent.document`, `localStorage`, `document.cookie` and `document.domain`
  all throw `SecurityError`;
- `fetch('/api/...')` fails — it is cross-origin with no credentials;
- it cannot reach any other frame.

Everything the panel can learn about the chamber goes through the bridge.

This is a sandbox, not a process boundary. Treat a plugin as untrusted code that
can do anything *within* its own frame.

## Writing a panel

A whole panel, importing both packages:

```tsx
import { render } from 'preact';
import { PanelProvider, usePanelInfo, useSessionValue } from '@ompchamber/ui';
import { Field, FieldList, Panel, TextAreaField } from '@ompchamber/ui/components';
import '@ompchamber/ui/styles.css';

function App() {
  const info = usePanelInfo();
  const note = useSessionValue('note');

  return (
    <Panel title="Session Info">
      <FieldList>
        <Field label="workspace" value={info.workspacePath ?? 'none'} />
      </FieldList>
      <TextAreaField id="n" label="note" value={note.value} hint={note.status} onInput={note.update} />
    </Panel>
  );
}

render(<PanelProvider><App /></PanelProvider>, document.body);
```

That is the whole setup. The provider owns both bridge subscriptions, and the
hooks read the merged state.

| Hook | Returns |
|---|---|
| `usePanelInfo()` | The live info. Re-renders when the workspace arrives. |
| `usePanelApi()` | The bridge itself, for `api.call(...)`. |
| `useTheme()` | The live palette id. |
| `useSessionValue(key)` | `{ value, status, error, update }` — per-session state, debounced. |

Two behaviours the packages exist to encode:

- **The context arrives late.** `workspacePath` and `sessionId` are resolved
  asynchronously by the chamber, so they are usually still empty when `ready`
  settles. The host re-sends them as a `context` message and the provider merges
  it — a component that captured `info` once would show "none" over a real
  workspace.
- **The theme is a delta.** The host sends only the id when the palette changes,
  and the provider applies it to `<html>` so `@ompchamber/ui/styles.css` can key
  off `:root[data-theme=…]`.

### The raw bridge

Underneath, it is one `postMessage` channel. `@ompchamber/plugin-sdk` is the
typed surface over it; reach for it directly only when you are not rendering
Preact.

```js
const api = window.acquireChamberPanel();

const info = await api.ready;       // resolves once the host has seeded the frame
info.title;                          // the panel's title
info.panelKey;                       // "plugin:session-info/info"
info.assetBase;                      // base URL for your own files
info.theme;                          // the live palette id
info.sessionId;                      // the active session, or null
info.workspacePath;                  // the active workspace root, or null
info.capabilities;                   // what this panel was granted

api.onTheme = (theme) => { /* palette changed */ };

const value = await api.call('sessionState.get', { key: 'count' });
await api.call('sessionState.set', { key: 'count', value: 42 });
```

The host repeats its `ready` greeting until it receives `init`, so a plugin that
runs its first line before the host has mounted still attaches.

`api.call` rejects with the host's reason. A method the panel was not granted,
and a method that does not exist, both fail — the error text distinguishes them,
but neither reveals anything a panel was not already told.

### Methods

| Method | Capability | Returns |
|---|---|---|
| `theme.get` | `theme` | The live palette id. |
| `sessionState.get` `{ key }` | `session-state` | The stored value, or `undefined`. |
| `sessionState.set` `{ key, value }` | `session-state` | `true`. |
| `workspace.list` `{ path }` | `workspace-read` | Directory entries (the same shape the Files panel uses). |
| `workspace.readText` `{ path }` | `workspace-read` | File contents, ≤ 512 KB. |

Declaring a capability in the manifest is the grant; calling a method without it
is refused by name. Keys are namespaced per panel under `panel.` in the session
store, so two panels cannot overwrite each other's state.

`workspace-read` is scoped to the **session's workspace** and goes through the
chamber's own fs route, so it inherits every root check that route enforces. A
session with no workspace folder answers "no workspace folder" rather than
falling back to a directory the user did not choose.

## Assets and URLs

`index.html` is served with the SDK and a Content-Security-Policy injected into
its `<head>`. Load your own files with relative URLs — the route's path is a real
base, so `./main.js` and `../shared/style.css` both resolve inside your plugin:

```html
<link rel="stylesheet" href="./style.css">
<script src="./main.js"></script>
<img src="./assets/logo.svg">
```

`fetch('./data.json')` also works: plugin assets are served with
`Access-Control-Allow-Origin: *` so the frame's opaque origin can read its own
data files. That allowance covers only static files inside your plugin
directory.

Served types: `.html .htm .js .mjs .css .json .svg .png .jpg .jpeg .gif .webp
.woff2 .woff .txt`. Anything else is refused with `415`. Individual files are
capped at 8 MB.

## Theming

The frame inherits nothing — not the chamber's CSS, not its fonts, not its
variables. `info.theme` carries the palette id and `api.onTheme` reports changes,
so a plugin can map the ids it cares about to its own variables.


## Publishing

Maintainers only. `@ompchamber/plugin-sdk` and `@ompchamber/ui` are released
independently of the app, because they are a library surface with its own
cadence:

```bash
# 1. bump the version in the package you are releasing
#    packages/plugin-sdk/package.json  or  packages/ui/package.json
# 2. tag it — the tag must name the package and match its version
git tag plugin-sdk/v1.1.0     # or ui/v1.1.0
git push origin plugin-sdk/v1.1.0
```

The workflow refuses a tag whose version does not match the package, runs the
same gates as CI, and then publishes. It is **idempotent**: a package already at
that version on npm is skipped, so a run that died after the first package can be
re-run (or dispatched manually with the `package` input) to finish the second
rather than failing on the first. `ui` depends on `plugin-sdk` at the exact
version, so a `both` run puts the SDK up first.

Requires the `NPM_TOKEN` environment secret — a granular token with read/write on
both packages. A scoped package defaults to restricted, so each package's
`publishConfig.access` is `public`; without it the SDK would be installable only
by its owner.

## A working example

`marketplace/plugins/session-info/` in this repository is the bundled plugin and
the reference implementation. It is a real Preact + Bun package: a
`package.json` with a build script, `preact` as its dependency and the
`ompchamber` manifest; a `tsconfig.json` pointing JSX at Preact; two TSX entries
that import `@ompchamber/ui` and `@ompchamber/ui/components` and nothing else; and
a `dist/` the chamber builds. It contributes both positions (one `right`, one
`editor`).

The packages themselves live in `packages/`:

| Package | Published | Contents |
|---|---|---|
| `packages/plugin-sdk` | yes | The bridge contract and its two helpers. |
| `packages/ui` | yes | The provider, the hooks, the components, the stylesheet. |
| `packages/plugin-build` | no (internal) | `chamberPackagePaths()` / `chamberPackageDirs()` — where the chamber finds the other two to link. |

The two published packages are released by
`.github/workflows/publish-plugins.yml`, on a `plugin-sdk/vX.Y.Z` or `ui/vX.Y.Z`
tag (or a manual run). See [Publishing](#publishing).

Copy its shape:

```bash
mkdir -p ~/.ompchamber/marketplace/plugins/my-panel/src
# write:
#   package.json   name/version/scripts.build/dependencies: preact/ompchamber key
#   tsconfig.json  jsx: react-jsx, jsxImportSource: preact
#   src/index.html <script type="module" src="./main.tsx">
#   src/main.tsx   render(<App />, document.body)
```

Then press **Refresh** in Settings → Panel Plugins, and **Rebuild** if the pane
says it is not built. The panel appears in the activity bar as a puzzle piece.

