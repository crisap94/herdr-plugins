# Design: tab-recap on the herdr desktop app

Evidence: `docs/research/studies/2026-11-07-gui-tab-recap-port/README.md` (findings F1–F9) and
`docs/research/studies/2026-11-07-gui-spikes/README.md` (S1–S6).

## Context

The engine (`src/recap`, `src/ports`, transcript readers, harness jobs, store) names no frontend. The TUI frontend is
`src/adapters/herdr/{fleet,agents,json}.ts`, `src/adapters/herdr/column-panes.ts`, `src/column/*` and
`herdr-plugin.toml` (F5). The desktop app runs mods: gpui-kit programs with `exec`, `hc`, `fetch`, small file reads and folder watches,
no Node, no raw sockets (F1; `fetch` to a localhost daemon was measured later, see `transport.md`).

## Decisions

**D1. One plugin, two frontends, no file moves (F5, F6).** A plugin installed from a sub-folder cannot reach a sibling, and a second
repository duplicates the engine. `HerdrFleet` is one class implementing nine ports and the daemon names the concrete class, so the
daemon is typed on `Fleet = FleetSource & Columns & Harnesses & Notifier & Screens & LaneTokens & PaneTokens & WorkspaceTokens`
plus `agents()` (`src/ports/fleet.ts`), and `HcFleet` (`src/adapters/hc-fleet.ts`) and, for the socket transport, `HcCoreFleet` (`src/adapters/hc-core-fleet.ts`) implement it. Moving the TUI files was rejected: it
touches the lane, baseline and graph gates and gains nothing. `TAB_RECAP_FRONTEND` (`tui` default, `gui`) is read once in `boot()`;
existing manifests keep working. "Host" is already a noun in `CONTEXT.md` (the machine and runtime), so the word here is
**frontend**.

**D1b. No column in the GUI: start hidden.** The domain already has "all columns hidden, recaps keep being written" (`allHidden`,
`src/recap/domain/visibility.ts`). The GUI frontend starts with it on, so no pane is opened and nothing new is added to the domain.

**D2. The GUI frontend talks to `hc` by spawning `hc` (F4). Amended 2026-11-08: see `transport.md`; `TAB_RECAP_HC_TRANSPORT=socket` replaces the spawns, `cli` stays the default.** `node:child_process` and `--json`; `hc events --json` is the frame
stream, `hc ls --json` the snapshot. No package, no socket client to maintain, and the CLI is the documented surface. A
hand-written socket client was rejected: it would duplicate `hc connect` for no gain.

**D3. Face = overlay, plus an optional chip (F2, F3; spikes S3, S6). Superseded by the locked UX (chip, pane strip, Fleet, Brief; `ux-plan.md`).** One mod, two faces. With `props().overlay` set it draws the
recap (`mod.open`, a key in a `keys.json` fragment). Without it, it draws a small chip (agent count, worst status, a click that runs
`mod.open`) for a floating block. A new mod is not docked by `place`, so the chip is an optional layout recipe, not shipped. The app
already posts its own "needs you" notification, so tab-recap posts no toast.

**D4. State goes to the mod as files (F8). Since 2026-11-08 the files are the fallback and the schema of record; the mod prefers the local API (`transport.md`).** The daemon writes `<state>/gui/<tab>.json` (atomic rename, under 1 MiB, the
seven sections plus status and freshness). The mod reads with `readTextFile` and refreshes on `watchFolder`. `show --json <tab>`
prints the same document, so the file format is the command's contract and has one schema in `schema/`.

**D5. Daemon start is the mod's job (F7; spike S1 passed).** `init` runs `tab-recap-desktop ensure` (`bin/tab-recap-desktop.ts`); `ensure` starts the daemon with
`hc run --bg --keep --no-parent --name tab-recap-d` and treats the `name_taken` error as "already running". It survives the window
and `hc server restart`. A copy of the mod starts only when first shown, so with the overlay alone the daemon starts on first open;
the chip block starts it with the window.

**D6. No typing into agents in the first release (F9; spike S2). Still true; roadmap P4 uses `terminal.keys`, `terminal.send` and `terminal.wait` on the core socket.** `hc send` always pastes; `hc keys` types only letters, digits,
space and a few marks. `Agents.prompt` and `typeLine` return `unsupported`, so compaction, handoff and autocompact stay off in the
GUI frontend until `/compact ` plus pasted guidance is shown to run in each agent.

**D7. One version (open question 1).** One `package.json` version, one changelog; the entry for a release names the frontend it
touches. Assumes the maintainer agrees.

## Risks

- `hc` is young (protocol generation 1, 0.1.x): pin the tested range in `doctor` and fail with a named message outside it.
- Session lookup (open question 3): if `hc` gives no session id, the frontend finds the transcript by `cwd` and newest file, which
  the readers already do for the TUI when the id is missing.
- Manual mod install: the recipe says what to copy and where; a `tab-recap install-gui` command is deferred.

## Hand-written pieces kept

No Node built-in replaces a gpui-kit view, so `gui/main.js` is hand-written. The `hc` JSON parsing uses `JSON.parse` and the
engine's existing decoders; nothing else is hand-written.
