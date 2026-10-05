# @ompchamber/ui

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1](https://github.com/rajebdev/ompchamber/compare/ui/v2.0.0...ui/v2.0.1) — 2026-10-05

### Fixed

* **ui:** let useSessionValue follow writes from other components ([de33442](https://github.com/rajebdev/ompchamber/commit/de33442f357bd6381c97af4b0758b647d5a0410a))

## [2.0.0](https://github.com/rajebdev/ompchamber/compare/ui/v1.0.0...ui/v2.0.0) — 2026-10-05

### BREAKING CHANGES

* **panels:** panel plugins must be rewritten. A plugin is now a package with
an `app` bundle exporting `definePluginApp`, not a directory of HTML documents;
the `panels` and `capabilities` manifest fields are gone, and `editorPanel` is
replaced by `panel`. Sandboxed panels are no longer supported.

### Added

* **panels:** run plugins in-process as Preact components, not sandboxed frames ([5018640](https://github.com/rajebdev/ompchamber/commit/50186400e5728192b6d977fdcc1b58e160f466de))
