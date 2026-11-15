# Proposal: tab-recap on the herdr desktop app

## Why

herdr now has a desktop app (`herdr-app`) that runs terminals in herdr-core (`hc`). tab-recap only works in the terminal UI:
its daemon talks herdr's TUI socket and draws a column that has to dock to the right of a tab. Maintainers who use the app
get no recap. The app has no column to dock, but it has what a recap needs better: a window that opens over the work, a
button per pane, and toasts. The study `docs/research/studies/2026-11-07-gui-tab-recap-port/README.md` found that the engine
already sits behind ports and only a thin layer names the TUI, so a second frontend is cheaper than a second plugin.

## What changes

- A new capability `gui-frontend`: tab-recap runs against herdr-core and shows a recap in a **mod** of the desktop app. The face is
  an overlay window opened by a key and a button, with a toast when an agent needs the operator. No column.
- The daemon is typed on one `Fleet` interface instead of the concrete `HerdrFleet`; a second implementation, `HcFleet` for the
  `gui` frontend, fills it from `hc`. No TUI file moves. The GUI frontend starts with every column hidden, so none is ever opened.
- A new engine command `tab-recap show --json <tab>` and a per-tab state file the mod reads; the mod never opens the store.
- The mod folder ships inside the plugin (`tab-recap/gui/`), with a `RECIPE.md` and a `preview.png`, as the app's sharing
  convention asks.
- One plugin, one version, two frontends. The TUI behaves exactly as before.

## Out of scope

- Any change to the recap's content, sections, vocabulary, writer harnesses or store.
- A GUI column, native-pane docking, or any edit of a shipped layout (the first release adds no layout).
- Remote machines (`hc machine`), macOS and Windows for the GUI frontend.
- Retiring the TUI frontend.

## Changelog label

The merge requests carry `changelog::added` (the GUI frontend) and, for the `Fleet` interface alone, `changelog::internal`.
