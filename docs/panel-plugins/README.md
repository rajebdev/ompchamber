# Panel Plugins

A panel plugin adds its own views to OMPChamber — a view in the right panel, a
tab in the editor panel, a readout in the navbar, a block in its settings.
**A plugin is a Preact + Bun package**, built the same way this app builds
itself, and the chamber imports its build output into its own page and renders
it in its own tree.

You write TSX, import from `node_modules`, and get one self-contained ESM bundle.
Preact is what this app renders with, so a plugin's components are built from the
same runtime and the same hooks — and the bundle is small because the shared
runtime is not bundled at all.

Two packages are provided by the chamber itself:

| Import | What it gives you |
|---|---|
| `@ompchamber/plugin-sdk` | The contract: `definePluginApp`, the slot and props types. |
| `@ompchamber/plugin-sdk/app` | The same contract, as the runtime slot the build shims to. |
| `@ompchamber/ui` | The hooks: `usePanelInfo`, `useTheme`, `useSessionValue`, `useWorkspaceFile`. |
| `@ompchamber/ui/components` | `Panel`, `Field`, `FieldList`, `TextAreaField`, `Button`, `Empty`, `Note`. |

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

## One store, one working marketplace

```
~/.ompchamber/marketplace/          the WORKING marketplace (installed plugins)
├── marketplace.json                the catalog — what is registered
└── plugins/
    └── session-info/               an installed plugin (a Preact + Bun package)
        ├── package.json            the ompchamber manifest
        ├── tsconfig.json           jsxImportSource: "preact"
        ├── src/
        │   └── app.tsx             definePluginApp(...) — the whole plugin
        └── dist/                   the build output the chamber imports
            └── app.js

<package>/marketplace/              the STORE, shipped with the app
├── marketplace.json
└── plugins/
    └── session-info/               offered, NOT installed
```

`dist/` is gitignored, so it is never committed: the chamber builds it. A plugin
is built when it is INSTALLED — never at boot — and the manifest's `app` names a
file inside `dist/`, with the pane offering **Rebuild** whenever it is missing.

**The bundled marketplace is a store, not a preinstalled set.** A plugin the
package ships is available in Settings → Panel Plugins and contributes nothing
until you install it, which is the shape VS Code uses: an extension is not
installed until you install it. A fresh chamber therefore starts with an empty
activity bar, and nothing is ever copied into your data directory behind your
back.

Install takes two sources and they converge:

- **Bundled.** The plugin's directory is COPIED out of `<package>/marketplace/`
  into the working marketplace and built there. Copying rather than serving from
  the package is required, not stylistic: a globally installed package sits in a
  read-only `node_modules`, the update flow replaces it outright, and a build
  would write into it.
- **Git URL.** A shallow clone into a staging directory, then the same commit
  step.

Afterwards the two are indistinguishable — same directory shape, same catalog
entry, same scan — which is what lets the pane treat them identically.

The working copy lives in your data directory because that is the only location
both install shapes can write.

`OMPCHAMBER_MARKETPLACE_DIR` overrides the working location and
`OMPCHAMBER_BUNDLED_MARKETPLACE_DIR` the store (both useful for testing).

## Installing, enabling, removing

Three separate things, and the pane keeps them separate:

| Action | What it changes |
|---|---|
| **Install** | Copies/clones the plugin into the working marketplace, builds it, registers it. |
| **Disable** | Flips a flag. The files stay; the plugin contributes NOTHING — no activity-bar button, no header button, no editor tab — and its bundle is no longer served. |
| **Remove** | Deletes the directory and its catalog entry. Re-installing is the only way back. |

Enablement is stored in the chamber's own database, not in the plugin directory:
the plugin's files are a third-party repository whose format the chamber does not
own. It is stored as the DISABLED set, so absent means enabled — which is what
makes a freshly installed plugin live immediately and keeps a database written
before this feature from switching everything off.

Hiding is a fourth, unrelated axis: **right-click the activity bar** to hide or
show a view (VS Code's own affordance). A hidden view keeps its row in that menu
with the checkbox off, which is where it is switched back on. The built-in views
are pinned there — the panel toggles in the navbar are what control those.

## Building

The chamber builds a plugin with Bun — the same runtime the app itself runs on,
and the same bundler (`bun build`, `target: 'browser'`) it bundles its own client
with.

- TSX needs `"jsx": "react-jsx"` and `"jsxImportSource": "preact"` in the plugin's
  `tsconfig.json`. Without it the compiler emits `react/jsx-dev-runtime`, which is
  not installed and never should be — a plugin may not rely on the app's own
  tsconfig, and the pane reports that fix rather than the raw module error.
- If `package.json` has a **`build` script**, that script runs. It wins, because a
  plugin may need a bundler pass the chamber knows nothing about (a framework, a
  template compiler).
- Otherwise the chamber bundles `src/app.tsx` (or `src/app.ts`, or the same at
  the plugin root) into the `app` file the manifest names. A plain plugin needs
  no build script at all — and a plugin built this way gets the shared runtime
  shimmed in, which a script-driven build must arrange for itself.
- **Dependencies are installed first** (`bun install --ignore-scripts`) when
  `package.json` declares any. `--ignore-scripts` because a postinstall would run
  arbitrary code on the SERVER.
- **`@ompchamber/*` is linked into the plugin's `node_modules`** before the
  build. Those packages are workspace links inside this checkout, so a plugin
  cloned into the marketplace cannot resolve them from its own install — `bun
  install` would have to fetch them from a registry that does not carry them.
  Symlinks, one per package, written after the install so it cannot delete them.
- **One Preact per bundle.** This matters only for a plugin that uses its own
  build script: the chamber's bundler marks `preact` external, but a script
  bundles whatever it resolves, and the linked UI kit would then pull a SECOND
  copy beside the plugin's. Two copies means two option objects, so Preact's
  hooks die at render with `Cannot read properties of undefined (reading '__H')`.
  The kit's own `node_modules/preact` is therefore pointed at the plugin's copy.
- `dist/` is **replaced**, never merged, so a file the current source no longer
  emits cannot survive.
- The bundle the manifest names must exist after the build. A build that produces
  nothing fails outright, because the alternative is a plugin that reports as
  built while every one of its panels is missing.

## Installing

Settings → **Panel Plugins**. Two ways in, one install step out:

- **Available from OMPChamber** — the bundled store. **Install** copies that
  plugin out of the package and builds it.
- **Install from a git URL** — paste a URL → **Install**.

The repository root must carry a manifest — an `ompchamber` key in
`package.json` (the usual case for a package), or a standalone `ompchamber.json`.
Accepted sources are what `git clone` accepts: `https://`, `ssh://`, the
`git@host:path` form, and a local path.

Either source stages OUTSIDE `plugins/` (a clone in a staging directory, a copy
in one) and moves into place only after its manifest validates. A clone that
fails halfway, or a repository that is not a plugin, therefore leaves the
marketplace exactly as it was instead of adding a directory the scan then reports
as broken. The destination name comes from the manifest's `id`, not from the URL
or the directory name — those say nothing about the plugin's identity.

Install stages, **builds**, and only then registers. A package whose build fails
is left on disk — so **Rebuild** can fix it — but is not written to the catalog,
which is why the pane reports it as *not built* rather than as a broken install.

Installing writes two things, and **Remove** undoes both: the directory and the
catalog entry. Removing only the directory would leave the catalog naming a path
that no longer exists, which the scan reports as a fault — the pane showing your
own successful removal as an error. Remove also clears the plugin's disabled
flag, so re-installing the same id comes back enabled rather than silently off.

**Disable** is not Remove: it leaves the files in place and stops the plugin
contributing. Use it to switch a plugin off without losing a hand-edited build.

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

It carries only what the host needs BEFORE the code runs: an identity, an
optional icon, and the bundle to import. Which panels exist, their titles and
their positions are decided by the registrations the bundle makes when it loads.

```json
{
  "name": "session-info",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "ompchamber": {
    "id": "session-info",
    "name": "Session Info",
    "version": "1.0.0",
    "description": "Shows the active workspace and keeps a note per session.",
    "app": "dist/app.js"
  },
  "devDependencies": {
    "preact": "^10.29.8",
    "@ompchamber/plugin-sdk": "*",
    "@ompchamber/ui": "*"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `[a-z0-9][a-z0-9._-]*`, ≤ 64 chars. The plugin's namespace. |
| `name` | yes | Shown in the activity-bar tooltip and the settings pane. |
| `version` | yes | Free-form string; displayed, not parsed. |
| `app` | yes | The BUILT ESM bundle, relative to the plugin root — conventionally `dist/app.js`. Its default export must be a `definePluginApp(...)` definition. |
| `icon` | no | Image, relative to the plugin root. Omit and the pane draws the plugin's initials. |
| `readme` | no | Markdown, relative to the plugin root. Defaults to `README.md` at the root when it exists. |
| `description` | no | Shown in the store list and the settings pane. |
| `homepage` | no | Displayed, never fetched. |
| `branding.icon` | no | An alias for `icon`; `icon` wins when both are present. |

**`app`, `icon` and `readme` must stay inside the plugin directory.** An absolute
path or a `../` segment is refused at scan time and reported in the pane, because
those values become filesystem reads on the bundle, icon and README routes.

**An icon is optional, and its absence is drawn, not hidden.** A plugin with no
`icon` is marked by its initials — `Session Info` → `si.`, the same rule the
provider marks use — in the activity bar, the navbar, the editor tab, the store
card and the installed card. A blank box would read as a broken plugin rather
than one that chose not to ship a mark.

**A README is what a user judges a plugin by before installing it.** Ship one (or
name another file with `readme`): the store card grows a **README** button that
opens it in the pane's own reader, and an installed card gets the same button
beside Remove. It renders through the chamber's markdown pipeline — sanitized,
with the same Shiki highlighting, KaTeX and mermaid hydration the chat timeline
has — so a plugin's README reads like the rest of the app. No button is drawn for
a plugin that ships none.

## Running model: in-process, not sandboxed

A plugin's bundle is a real ES module that the host `import()`s into the page,
and the components it registers are rendered **in the host's own Preact tree** —
the same Preact instance, the same document, the same theme. There is no iframe,
no message channel and no separate realm.

That is the point: a plugin's UI looks and behaves like the chamber's own,
because it *is* the chamber's own rendering. It also means a plugin is **local
code you installed, trusted the way a VS Code extension is trusted** — it can
read `localStorage`, call the chamber's API and touch the DOM. Install plugins
you would run.

Two rules make it work, and both are enforced by the build:

- **One Preact.** The build marks `preact`, `preact/hooks`, `preact/jsx-runtime`,
  `preact/jsx-dev-runtime`, `preact/compat`, `@ompchamber/plugin-sdk/app`,
  `@ompchamber/ui` and `@ompchamber/ui/components` EXTERNAL, and rewrites each to
  read `globalThis.__ompchamberPluginRuntime` — the object the host publishes
  before any bundle loads. A plugin that bundled its own Preact would create
  components the host's tree cannot render (`Cannot read properties of undefined
  (reading '__H')` at the first render), which is why this is correctness, not
  size.
- **The host owns the services.** `@ompchamber/ui` reads the active session, the
  workspace and the palette through services the host injects at boot, so a
  plugin gets the chamber's answers rather than its own guesses.

## Writing a plugin

One file, one bundle, one `definePluginApp` default export:

```tsx
import { definePluginApp } from '@ompchamber/plugin-sdk/app';
import { usePanelInfo, useSessionValue } from '@ompchamber/ui';
import { Field, FieldList, Panel, TextAreaField } from '@ompchamber/ui/components';

function SessionInfo() {
  const info = usePanelInfo();
  const note = useSessionValue('note');

  return (
    <Panel title="Session Info">
      <FieldList>
        <Field label="workspace" value={info.workspacePath ?? 'none'} />
      </FieldList>
      <TextAreaField id="n" label="note" value={note.value ?? ''} hint={note.status} onInput={note.update} />
    </Panel>
  );
}

export default definePluginApp((app) => {
  app.rightPanel({ id: 'info', title: 'Session Info', component: SessionInfo, minWidth: 300, defaultFraction: 0.35 });
});
```

The build compiles `src/app.tsx` (or `src/app.ts`, or the same at the plugin
root) into the `app` file your manifest names. A plugin that declares its own
`build` script owns its output instead — and then carries its own runtime unless
it marks the shared specifiers external itself.

**Do not declare `preact` as a dependency.** It is provided by the host, exactly
like `@ompchamber/*`, and the shim makes the build read the host's instance
rather than bundling one. Declaring it as an optional peer (for types) is fine;
declaring it as a real dependency makes `bun install` fetch a second copy the
plugin must not use.

**JSX needs `"jsxImportSource": "preact"` in the plugin's `tsconfig.json`.**
Without it TypeScript compiles JSX for React and the build fails on
`react/jsx-dev-runtime`; the pane says exactly that rather than showing the raw
module error.

### Slots

| Method | Where it appears | Props |
|---|---|---|
| `app.rightPanel({ id, title, component, minWidth?, defaultFraction? })` | A button in the right-panel activity bar; the view opens in the right panel. | `{ sessionId, workspacePath }` |
| `app.panel({ id, title, component, minWidth?, defaultFraction? })` | The editor COLUMN, taken over whole. | `{ sessionId, workspacePath }` |
| `app.headerPanel({ id, title, component, dropdown? })` | An entry in the DESKTOP navbar. | `{ sessionId, workspacePath }` |
| `app.settingsSection({ id, title, component })` | A block in Settings → Panel Plugins, under the plugin's row. | `{ pluginId }` |

**One registration per slot.** A second call THROWS: the layout gives a plugin
one activity-bar button, one navbar entry and one column, so a second
`rightPanel` could never be reached, and a quiet overwrite would hide a plugin
that is broken.

`position` in the old manifest is gone — a registration IS the position.

### `panel` is a place, not an editor

The editor column is the SECOND place a view can live. A plugin registered with
`app.panel(...)` takes that column over WHOLE — full-bleed, with **no tab strip
and no editor chrome**. The host supplies no tabs, no file tree, no split and no
save/find/wrap toolbar: a plugin that wants any of those builds them inside its
own component.

That is why the slot is named `panel` rather than `editor`: it says where the
component renders, not what it must look like. While a plugin owns the column,
the host's file tabs are not drawn at all; the navbar's editor toggle is what
gives the column back.

### A header is a trigger, and optionally a dropdown

A header registration is **two components**, because a navbar entry is a readout
first and an interaction second:

```tsx
app.headerPanel({
  id: 'stats',
  title: 'Session Stats',
  // What the navbar reads — text, an icon, a `10tps ⛁10GB` readout, anything.
  component: SessionStatsTrigger,
  // Optional. Without it the entry is a static readout, not a button.
  dropdown: { component: SessionStatsDropdown },
});
```

- **With `dropdown`** the host wraps your trigger in a real `<button>` —
  keyboard reachable, `aria-expanded`, closed by Escape and by an outside click —
  and renders the dropdown component below it while open. Only one header's
  dropdown is open at a time, across every plugin, because the navbar is one row
  and two would overlap.
- **Without `dropdown`** the trigger is rendered as inert text. It is
  deliberately not a button: making it one would advertise an interaction that
  does not exist.

Header entries are DESKTOP ONLY — a phone's navbar has no room for them, and the
phone's drawer already carries every view.

### Hooks

| Hook | Returns |
|---|---|
| `usePanelInfo()` | `{ sessionId, workspacePath, theme }`, re-rendering when any of them changes. |
| `useTheme()` | The live palette id. |
| `useSessionValue(key, delayMs?)` | `{ value, status, error, update }` — per-session state, debounced. |
| `useWorkspaceFile(relPath)` | `{ content, loading, error }` — a text file inside the active workspace. |

Two behaviours the kit exists to encode:

- **The context arrives late.** The active session and workspace are resolved
  asynchronously, so a component that captured them once would show "none" over
  a real workspace. Every hook subscribes and re-renders.
- **Session state is not component state.** A component is unmounted when its
  panel is hidden, so a value kept in `useState` alone would be lost on every
  tab switch. `useSessionValue` reads the chamber's store.

### Styling

Use the chamber's Tailwind utilities and theme variables directly — `bg-paper`,
`text-ink`, `border-ink/10`, `text-error`. A plugin renders in the host's
document, so those classes are already in the stylesheet and the palette applies
for free. There is no stylesheet to import and no `oc-*` class layer any more.

A plugin added to `~/.ompchamber/marketplace/` is **outside the project root**,
so Tailwind's scan does not see its own class names. Prefer the kit's components
(`Panel`, `Field`, `FieldList`, `TextAreaField`, `Button`, `Empty`, `Note`) and
inline styles for anything the kit does not cover.

## The bundle route

`GET /api/panels/bundle/<plugin>.js` serves the built module, unmodified, as
`text/javascript` with `no-store`. The URL carries a content hash, so a REBUILT
plugin gets a new URL and is re-imported instead of being answered from the
browser's module cache — which is what makes **Rebuild** actually reload it.

The plugin is named by its directory and the file comes from the registry, so a
request can only reach a bundle inside an installed, **enabled** plugin. A
disabled plugin's bundle is a `404`, which is what makes disabling stop the code
rather than only hiding the button.

`GET /api/panels/icon/<plugin>/<path>` serves an icon from the same directory,
images only, with the path resolved inside the plugin root.

`GET /api/panels/readme/<plugin>/<path>` serves a plugin's README as
`text/markdown`, markdown extensions only (`.md`, `.markdown`, `.mdx`, `.txt`),
capped at 512 KB. Both routes resolve the plugin directory the same way the
bundle route does — the working copy first, the bundled store second — which is
what lets a card draw the mark and open the README for a plugin that is **not
installed yet**. That is the whole point of the button: a user judges a plugin
before committing to it.

## Theming

A plugin renders in the chamber's own document, so it inherits everything for
free: `data-theme` on `<html>`, the CSS variables, the fonts, the Tailwind
utilities. A plugin that only renders markup needs to do nothing.

`useTheme()` returns the palette id for the cases where a plugin must know it in
code — a chart's own colour scale, a swatch, an inline style. It re-renders when
the palette changes.

## Publishing

Maintainers only. `@ompchamber/plugin-sdk` and `@ompchamber/ui` are released
independently of the app, because they are a library surface with its own
cadence.

**The version is derived from your commits — do not bump it by hand.**
`.github/workflows/release-packages.yml` runs on every push to `main`, right
beside the app's own release, and each package gets a release only from the
commits that touched its directory:

```bash
# ships the app, and NOT the packages: no file under packages/ changed
git commit -m 'feat(panels): add a slot'

# ships the SDK (a minor bump) — and the UI kit, because the version moves with it
git commit -m 'feat(sdk): add a capability flag' -- packages/plugin-sdk

# ships the SDK as 2.0.0
git commit -m 'feat(sdk)!: drop the old slot name

BREAKING CHANGE: ...' -- packages/plugin-sdk
```

The version rules are the app's, reused rather than restated
(`release/release-rules.js`), so `feat` is a minor, `fix` is a patch, `!` on a
`feat`/`fix`/`perf`/`refactor` is a major, and `chore`/`docs`/`test`/`ci` alone
release nothing. A package's release range starts at its own last tag, so a
package that was not touched since then is left alone — and because the analyzer
only ever sees that package's commits, an app `feat` in between cannot bump it.

The release cuts a tag (`plugin-sdk/v2.0.0`) and a GitHub Release, writes the
package's `CHANGELOG.md`, and commits the version into its `package.json`. That
push is made with `GITHUB_TOKEN`, which raises no workflow run, so the workflow
then **dispatches** `publish-plugins.yml` for exactly the packages it released.
The two are one pipeline split in two for the same reason the app's are: the npm
side keeps the `npm` environment's approval gate, the gates and the tarball
check in one place.

`ui` declares its SDK dependency as `workspace:*`, which becomes an exact
version in the published tarball — read from `bun.lock`, not from the manifest.
The release therefore refreshes the lock and commits it with the version, so a
`ui` release pins the SDK version it was actually built against; and the
packages are released in order, with a failed SDK release stopping the run
rather than publishing a `ui` against an SDK that is not there.

**To publish by hand** — a re-run after a failed publish, or a package cut from
a branch — bump the version in the package's `package.json`, push a matching tag,
and the same workflow publishes it. If the package you are bumping is depended
on by the other (`plugin-sdk`), run `bun install` first so `bun.lock` carries
the new version:

```bash
git tag plugin-sdk/v1.1.0     # or ui/v1.1.0
git push origin plugin-sdk/v1.1.0
```

A tag whose version does not match the package is refused. Publishing is
**idempotent**: a package already at that version on npm is skipped, so a run
that died after the first package can be re-run to finish the second rather than
failing on the first.

Requires the `NPM_TOKEN` environment secret — a granular token with read/write on
both packages. A scoped package defaults to restricted, so each package's
`publishConfig.access` is `public`; without it the SDK would be installable only
by its owner.

## A working example

`marketplace/plugins/session-info/` in this repository is the bundled plugin and
the reference implementation. It is a real Preact + Bun package: a
`package.json` with the `ompchamber` manifest, a `tsconfig.json` pointing JSX at
Preact, and ONE `src/app.tsx` whose `definePluginApp` registers three slots (a
right panel, a header readout, an editor tab). It declares no build script — the
chamber bundles it.

The packages themselves live in `packages/`:

| Package | Published | Contents |
|---|---|---|
| `packages/plugin-sdk` | yes | The app contract: `definePluginApp` and the slot/props types. |
| `packages/ui` | yes | The hooks, the components, and the service seam the host fills. |

The host half of that seam is `src/client/lib/plugins/`: `runtime.ts` publishes
`globalThis.__ompchamberPluginRuntime`, `loader.ts` imports each enabled plugin's
bundle, `slots.ts` keeps what the bundles registered, and `kit.ts` hands the UI
kit the chamber's own services.

`packages/` is the development home of the two published packages; it is **not**
what the chamber reads at runtime. The chamber resolves them with
`Bun.resolveSync` from its own tree, which answers both shapes: a checkout (via
the `workspaces` map) and a published install (via `node_modules`). A fixed path
would be wrong for one of them — the app's `files` list does not ship `packages/`,
and a plugin cannot fetch these from a registry on its own.

The two published packages are released automatically by
`.github/workflows/release-packages.yml` on every push to `main`, from the
Conventional Commits that touched each package; `.github/workflows/publish-plugins.yml`
is what puts them on npm, and also accepts a `plugin-sdk/vX.Y.Z` or `ui/vX.Y.Z`
tag for a manual release. See [Publishing](#publishing).

Copy its shape:

```bash
mkdir -p ~/.ompchamber/marketplace/plugins/my-panel/src
# write:
#   package.json   name/version + the ompchamber key (id, name, version, app)
#   tsconfig.json  jsx: react-jsx, jsxImportSource: preact
#   src/app.tsx    export default definePluginApp((app) => { ... })
```

Then press **Refresh** in Settings → Panel Plugins, and **Rebuild** if the pane
says it is not built. The panel appears in the activity bar as a puzzle piece.

