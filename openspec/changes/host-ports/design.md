# Design

## Context

See proposal.md. Measured: with `import './guard.mjs'; import './sibling.mjs'` where the guard awaits, Node evaluates
`sibling.mjs` before the guard finishes (only the importer's body waits). A Node that cannot strip types fails while
loading the `.ts` graph, before any of it runs. herdr runs manifest `command` arrays directly, so the first file Node
loads is under our control.

## Goals / Non-Goals

**Goals:** no TypeScript is loaded until the host is known to be supported; host/OS facts enter through ports with
per-OS adapters; the domain and application layers never branch on the OS; a macOS contributor can run every gate.
**Non-Goals:** shipping Windows support; changing herdr's own behaviour.

## Decisions

1. **Launchers are the primary adapters at the edge.** `bin/tab-recap.mjs`, `src/column/launch.mjs`,
   `src/setup/launch.mjs`, `src/compact/launch.mjs`, `src/daemon/launch.mjs` — plain JavaScript (no TypeScript syntax,
   no static import of a `.ts`), each: read the host (`src/host/node-host.mjs`), ask the policy, then either
   `await import('./main.ts')` or present the refusal for its kind (pane: clear, show, stay until SIGTERM; daemon: a
   dated line to stderr → `daemon.log`, exit 1; command: stderr, exit 1, except `status`, which imports its entry and
   reports). The manifest commands, the daemon spawn and the column's `execve` roll point at the launchers.
2. **Host policy is pure and plain JS** (`src/host/policy.mjs` + `policy.d.mts`): `supportOf({nodeVersion,
   platform}) → {ok} | {ok: false, found, needed, platform, steps: StepId[]}`; `MIN_NODE = '24.21.0'`; step ids per
   platform (`macos`: brew install node / mise / nvm, `herdr server stop`, new terminal, `launchctl setenv PATH` when
   herdr starts from a launcher; `linux`: nvm / mise / n, `herdr server stop`, new terminal; `windows`: winget /
   nvm-windows, restart herdr). It is the single source of the minimum (`host-check.ts` re-exports it). The TS catalogs
   (en/es) render the steps; `policy.mjs` carries the English fallback text for a Node that cannot load the catalogs.
3. **Ports and adapters for host differences** (application code depends on the ports only):
   - `Host` (`src/ports/host.ts`): version, execPath, platform, PATH — adapter `src/host/node-host.mjs` (used by
     launchers too).
   - `ProcessControl` (`src/ports/process-control.ts`): `run(command, args, {input, timeoutMs, cwd, env})` and
     `killTree(pid)` — adapters `src/adapters/process-posix.ts` (today's detached group + `process.kill(-pid)`) and
     `src/adapters/process-windows.ts` (`taskkill /PID <pid> /T /F`, `windowsHide`), chosen by platform at the composition
     roots; `run.ts` becomes the POSIX adapter.
   - `ConfigPaths` (`src/ports/config-paths.ts`): default config/state dirs when herdr's env does not give them —
     adapters `xdg` (Linux and macOS, as today, since herdr uses `~/.config` there) and `windows` (`%APPDATA%` /
     `%LOCALAPPDATA%`).
4. **Red line:** a new ast-grep rule `host-probes-at-the-edge`: `process.platform`, `os.platform()`, `os.type()`,
   `process.env.PATH`, `node:os` imports only under `src/host/` and the `*-posix`/`*-windows` adapters (`homedir` stays
   allowed in `ConfigPaths` adapters); probes for good and bad.
5. **`s` key** as in PR #1 (spawn `configure` after the modal closes; footer hints en/es), rebased on 1.9.0.
6. **Portable gates:** `ci/lint.sh` and friends use `while IFS= read -r` instead of `mapfile`; the GitHub macOS job
   drops `brew install bash` and runs the gates on `/bin/bash` 3.2; `package-lock.json` engines `>=24.21.0`;
   `daemon-state.test.ts` pins `TAB_RECAP_LOCALE=en` for the messages it asserts.
7. **Credit:** every commit of this change that carries PR #1's work ends with
   `Co-authored-by: toribio99 <97573280+toribio99@users.noreply.github.com>`.

## Risks / Trade-offs

- [More entry files] → five tiny launchers, one shape, tested together.
- [Windows adapters without a Windows CI] → unit-tested with fakes; `platforms` stays linux/macos until a Windows job exists.
- [Spawned `.mjs` launchers change `process.argv[1]`] → the `execve` roll and status use the launcher path; tested.

## Migration Plan

One MR, one release. No state change. Rollback: the previous release.
