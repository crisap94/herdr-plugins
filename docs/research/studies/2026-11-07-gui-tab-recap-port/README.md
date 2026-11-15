---
id: R-2026-11-07-01
name: "Tab Recap on the Herdr GUI"
question: "What does the Herdr GUI (herdr-app on herdr-core) offer and require for a tab-recap front-end, and how should herdr-plugins be organised to ship the TUI and GUI versions?"
date: 2026-11-07
owner: "crisap94"
method: live-probe
status: concluded
superseded_by: null
confidence: medium
informs: [openspec/changes/gui-port]
tags: [herdr-app, hc, tab-recap, gui]
---

# Tab Recap on the Herdr GUI

## Question

tab-recap is a recap column for the herdr terminal UI (TUI). The maintainer now runs the herdr desktop app (`herdr-app`, on
herdr-core, `hc`) and wants the same recap there, possibly as a button instead of a column. Before planning, we need to know what
the GUI lets a plugin do, what the existing engine needs from its host, and whether `herdr-plugins` should hold both front-ends.

## Method

Read-only probes on herdr 0.9.5, herdr-app and herdr-core 0.1.18 (Linux), plus reading the GUI's own guide
(`~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`) and the tab-recap sources. Nothing was started, installed or changed in the
running window. `scripts/capture.sh` re-runs every command and writes masked output to `evidence/`. Time box: one session.

**Protocol (written before collecting):** (1) the GUI's plugin model and limits, from its guide and type file; (2) the data the
engine needs from a host, from `src/ports/` and the two herdr adapters; (3) whether herdr-core can supply that data, from
`hc schema`, `hc ls`, `hc get`; (4) install and distribution routes, from `herdr plugin install --help` and the guide; (5) the
repository's own constraints, from `openspec/config.yaml`. Judged by: can every host-facing port be filled without a runtime
dependency and without changing the engine? **Deviations:** the planned probe of the `herdr-app` socket for protocol 22 was
dropped; `hc` has its own documented JSON-RPC API, which is the better integration surface (finding 4). Starting a daemon from a
mod was not tried live (finding 7).

## Findings

| # | Finding | Evidence | Confidence |
| --- | --- | --- | --- |
| 1 | The GUI is a different host. A plugin there is a **mod**: a `main.js` class built on `gpui-kit` plus a `mod.json`. It has no Node, no sockets, no `setTimeout` and no HTML or CSS. It can run programs (`exec`, 30 s and 8 MiB), call `hc`, read files up to 1 MiB, watch a folder (`watchFolder`), run `cx.timer.every`, and it re-renders when spaces, tabs, panes or agent status change. | GUI guide "Rules" section; `herdr.d.ts` (`exec`, `hc`, `readTextFile`, `watchFolder`) | high |
| 2 | **A column is not needed, and a button is better.** The GUI draws mods three ways that suit a recap: an **overlay** (`openOverlay` with `kind` `dialog`, `popup` or `window`; a `window` keeps its spot with `key` and `keep: true`); a **pane header** mod (one copy per pane, with `props().pane`, live agent status, buttons that run commands); and a **floating block** (an edge drawer with `peek`). A mod can also be a native pane (`pane.split` with `mod`). Opening is by `mod.open {name}`, a key in `keys.json`, or a click. `notify` posts a toast. | GUI guide "Pane frames", "Floating blocks", overlay API; `herdr-app commands` | high |
| 3 | A button needs a layout slot, and shipped layouts are replaced at start (edits move to `<name>-edited`). A pane-header button therefore means shipping or editing a layout; an overlay opened by a key, plus a toast for "needs you", needs no layout change. | GUI guide "Layouts and mods other people made", `herdr.d.ts` line 73 | medium |
| 4 | **herdr-core can supply what the engine needs.** `hc` is JSON-RPC 2.0 over a socket and also a CLI: `terminal.list`, `terminal.get`, `terminal.send`, `terminal.keys`, `terminal.wait`, `terminal.read`, `events.subscribe`, `doc.get/set`. A terminal record carries `address`, `cwd`, `turn`, `status {app,msg,state}`, `foreground {argv,cwd,name,pid}` and labels `herdr.space`, `herdr.tab`, `where`. | `evidence/hc-api-methods.json`, `evidence/hc-get-shape.json` | high for the shape; medium that it is complete (session ids for transcript lookup were not probed) |
| 5 | **The engine already has the seam.** A host supplies `FleetSource` (`snapshot()` and `subscribe(topics)` returning frames), `Agents` (`status`, `prompt`, `typeLine`, `askNote`), and the column and modal ports. Only `adapters/herdr-fleet.ts` (251 lines), `adapters/herdr-agents.ts` (82), `adapters/herdr-json.ts`, `adapters/column-panes.ts`, `src/column/*`, `src/host/*` and `herdr-plugin.toml` name herdr's TUI wire. Transcript readers, ledger, harness jobs and the SQLite store do not. | `src/ports/fleet-source.ts`, `src/ports/agents.ts`, `wc -l` over the adapters | high |
| 6 | **Install is GitHub-only and per folder.** `herdr plugin install <OWNER/REPO[/SUBDIR]>` installs "from GitHub", so a sibling package cannot be imported by a plugin installed from a sub-folder: the engine must live inside the plugin's folder or be bundled into it. The repository is public on GitHub (HTTP 200 without credentials), so it can use only public dependencies, and `openspec/config.yaml` already forbids runtime packages. Mods are shared as a public GitHub folder with `RECIPE.md`, `preview.png` and the topic `herdr-mod`; adding one is copying `mods/<name>/` into the person's home. There is no `herdr-app` install command. | `evidence/herdr-plugin-install-help.txt`, `evidence/github-repo-http.txt`, GUI guide | high |
| 7 | **No startup hook for mods was found.** The TUI manifest starts the daemon with `[[startup]]`; the GUI guide documents none. Candidate: the mod's `init` runs `exec` on `tab-recap ensure`, which starts the daemon with `hc run --bg --keep`; `hc` keeps terminals alive when the window closes. Not tried live. | grep of the guide and `herdr.d.ts` for startup, daemon, lifecycle: no match | low until a spike runs it |
| 8 | **The mod cannot open the SQLite store**, so the daemon must publish a small JSON file per tab (under 1 MiB) and the mod reads it and refreshes on `watchFolder`, or the mod asks `exec tab-recap show --json <tab>`. | `readTextFile` limit; no SQLite in `gpui-kit` | high |
| 9 | **Typing into agents differs.** The TUI path sends text and Enter as separate `pane.send_text` and `pane.send_keys` calls because a pasted block is taken as content (`CONTEXT.md`, Compaction). `hc send` "pastes text and presses enter" and `hc keys` presses keys. Whether `/compact` typed via `hc` runs as a command is unmeasured. | `hc --help`; `tab-recap/CONTEXT.md` | low |

## Options rejected and drawbacks

| Option | Why it lost |
| --- | --- |
| A second repository for the GUI | Duplicates the engine (about 400 source files) and doubles releases; the seam in finding 5 makes a second repository unnecessary. |
| A separate plugin folder (`tab-recap-gui/`) that imports `../tab-recap` | A plugin installed from a sub-folder does not get its sibling (finding 6). |
| Port the TUI column as a native-pane mod | Reproduces a workaround (docking) the GUI does not need, and gives up the button and overlay of finding 2. |
| Probe the `herdr-app` socket and speak herdr's protocol 22 | The GUI is not the TUI server; `hc` is documented and sufficient (finding 4). |

Drawbacks of the recommendation: the GUI install is manual (copy a folder), the daemon lifecycle is unproven, and every GUI
release depends on `hc` 0.1.x, which is young (protocol generation 1).

## Limits and threats to validity

- One machine, one session; herdr 0.9.5 and herdr-core 0.1.18, Linux. The GUI guide ships with the app and may drift.
- Findings 7 and 9 are inferences from documentation, not observations. The plan makes both the first spikes.
- `hc ls` was read against a live fleet with several agents; shapes were captured, free text was not kept.
- Not probed: macOS, remote machines (`hc machine`), `claude`/`codex`/`opencode` session lookup from an `hc` record.

## Recommendation

**Proceed with conditions, one repository and one plugin with two hosts, confidence medium.** Keep `herdr-plugins` as it is and
add the GUI as a second host of `tab-recap`: the engine stays in `tab-recap/`, the TUI-coupled files move behind a host
boundary, and a new GUI host fills `FleetSource` and `Agents` from `hc`. The GUI front-end is a mod folder shipped inside the
plugin (`tab-recap/gui/`), whose face is an overlay window opened by a key and a button, with a toast for "needs you", not a
column. Conditions: spike the daemon start (finding 7) and the `/compact` typing (finding 9) before building the UI, and ship
no layout edits in the first release (finding 3).

## Open questions and follow-ups

1. Is one version number for both hosts acceptable? (The recommendation assumes yes: one engine, one release.)
2. Will the GUI replace the TUI? If so, stop investing in the TUI column and keep only the host boundary.
3. Does `hc` expose the agent's session id, or must the GUI host find the transcript by `cwd` and recency? (Spike 3 in the plan.)
4. Can a mod add a button to the shipped `tabs` or `pane` mod without cloning a layout? Settled by reading `mods/tabs/main.js`
   and trying `herdr-app check`.
