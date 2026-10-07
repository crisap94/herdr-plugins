# Proposal

## Why

The plugin runs on Linux and macOS (Windows later), but what depends on the host is scattered: a POSIX-only
process-group kill in `run.ts`, Node fix steps hard-coded in the catalogs, a `bash ≥ 4` lint script that a macOS
contributor could not run, and no defence against an unsupported Node. A contributor (toribio99, GitHub PR #1) found
that with an old Node on herdr's server PATH the column waits forever and the daemon logs SQLite errors, and proposed a
Node guard plus an `s` key for the settings. Review showed the guard, imported first, does not stop the other modules
from being evaluated (an ES module with top-level await only delays its importer's body), and cannot help a Node that
cannot load `.ts`. The PR also surfaced two real bugs: `package-lock.json` still says `node >=24`, and
`test/db/daemon-state.test.ts` fails under a Spanish locale.

## What Changes

- **Hexagonal host layer.** Everything that depends on the operating system or the runtime goes behind ports, with
  one adapter per OS family chosen once at a composition root: `Host` (Node version, executable, platform, PATH),
  `ProcessControl` (spawn with a timeout and kill the whole process tree: POSIX process groups now, Windows later) and
  `ConfigPaths` (default config/state directories when herdr does not pass them). A lint red line allows
  `process.platform`, `node:os` platform/type and other host probes only in the host adapters.
- **Launchers.** Every entry herdr starts (commands, column, settings, compaction popup) and the daemon start through a
  small plain-JavaScript launcher that checks the host first and only then imports the TypeScript entry. On an
  unsupported Node it says what was found, what is needed, which `node` ran, and the fix steps **for that OS**
  (macOS: Homebrew and launchd PATH; Linux: nvm/mise/n; Windows: winget/nvm-windows), in the operator's language
  when the catalogs can load and in English otherwise; a column or popup shows it and stays; the daemon logs it and
  exits; a command prints it and exits (`status` reports it and goes on).
- **`s` opens the settings** from the column and the modal (from PR #1).
- **Portable tooling:** `ci/*.sh` run on macOS' bash 3.2 (no `mapfile`); the GitHub macOS job proves it with the
  system bash.
- **Bug fixes from PR #1:** `package-lock.json` engines `>=24.21.0`; the daemon-state test passes under any locale.
- Credit: commits carry `Co-authored-by: toribio99`.

Out of scope: declaring Windows in the manifest (`platforms`); a Windows CI job; clipboard or terminal ports.

Merge request label: `changelog::added`.

## Capabilities

### New Capabilities

- `tab-recap/host-support`: which hosts the plugin runs on, how it says when it cannot, and how host differences are
  kept out of the rest of the plugin.

### Modified Capabilities

_None._ (`state-store` already requires Node ≥ 24.21.0 and a refusal that says so; this change makes that refusal
reach every entry point.)

## Impact

Manifest commands, `bin/`, entry points of column/setup/compact/daemon, new `src/host/` (policy, launchers, adapters),
`src/adapters/run.ts` (ProcessControl), `daemon/config.ts` (ConfigPaths), i18n, `rules/` (+ probes), `ci/*.sh`,
`.github/workflows/ci.yml`, `package-lock.json`, tests, README/CONTRIBUTING.
