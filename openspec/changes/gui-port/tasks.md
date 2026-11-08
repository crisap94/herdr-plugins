# Tasks: tab-recap on the herdr desktop app

Every group ends with the plugin gates passing (`bash ci/lint.sh` and `bash ci/test.sh`, from `tab-recap/`, on Bun 1.4.4, the plugin floor). Baseline on 2026-11-07, before any change: 2478 tests, 2470 pass, 3 fail
(`--help`, `a real launcher on this Node loads its entry`, `node:sqlite prints nothing on stderr`: stderr noise from this machine's
Node) and 5 cancelled (the timing group around test 2221); a change must not add to either list.

## 1. Spikes (R-2026-11-07-02)

- [x] 1.1 A mod's `init` starts the daemon through `hc run --bg --keep --no-parent --name tab-recap-d`; a second start is `name_taken`.
- [x] 1.2 `hc send` pastes; `hc keys` cannot type `!"#$%&()*+:<>?@^_{|}~`. Typing into agents stays off in the first release.
- [x] 1.3 A claude terminal maps to its session through `foreground.pid` and `~/.claude/sessions/<pid>.json`.
- [x] 1.4 A new mod is not docked by `place`; a floating block in a layout shows it, so the chip is an optional layout recipe.

## 2. Vocabulary and the `Fleet` interface (`changelog::internal`)

- [x] 2.1 Add the nouns `frontend`, `mod`, `overlay` and `chip` to `tab-recap/CONTEXT.md` before any code. Verify: the vocabulary step passes.
- [x] 2.2 `src/ports/fleet.ts` declares `Fleet`; `HerdrFleet implements Fleet`; `daemon/{main,handoff,compaction,dispatch-parts}.ts` name
      `Fleet`, and only `boot()` names a constructor. Verify: the suite has the baseline result and the domain-type, graph and ast-grep gates are green.

## 3. GUI frontend (`changelog::added`)

- [x] 3.1 `src/adapters/hc-fleet.ts (the hc calls)`: run `hc ... --json` through the existing process helpers, decode with the engine's decoders, map
      `error.kind` to the unknowable results. Verify: tests against a fake `hc` script on `PATH`.
- [x] 3.2 `src/adapters/hc-fleet.ts` (`HcFleet implements Fleet`): `snapshot()` from `hc ls --json` with `columns: []`; `subscribe()` from
      `hc events --json` mapped to the frames the informer decodes, with a polling fallback; `readScreen()` from `hc read`; `available()` from
      `PathHarnesses`; columns, tokens and notifier return unsupported. Verify: scenarios "a working agent appears" and "herdr-core is unreachable".
- [x] 3.3 `agents()`: `status` from `hc get`; `prompt` and `typeLine` report unsupported (compaction, handoff and autocompact stay off).
- [ ] 3.4 Session lookup (claude by pid file is done; codex, opencode and hermes are roadmap P6): claude by pid file; codex, opencode and hermes by cwd and newest transcript. Verify: a transcript is found for each in a fixture.
- [x] 3.5 `boot()` reads `TAB_RECAP_FRONTEND`; `gui` starts with `allHidden: true` and a state directory under `$XDG_STATE_HOME/tab-recap`;
      `tab-recap start|ensure|stop` for the GUI (`ensure` treats `name_taken` as running). Verify: scenario "an agent appears" opens no pane; start twice, one daemon.

## 4. State for the mod

- [x] 4.1 `schema/gui-tab.schema.json` and the writer that publishes `<state>/gui/<tab>.json` atomically, under 1 MiB. Verify: a schema test and a size-cap test.
- [x] 4.2 `tab-recap show --json <tab>` prints the same document. Verify: the output validates against the schema.

## 5. The mod

- [x] 5.1 `gui/main.js` and `gui/mod.json`: overlay with the seven sections, status colours, freshness, refresh on `watchFolder`, Esc to close;
      chip with count and worst status. Verify: `herdr-app check gui`, then the visual run below.
- [ ] 5.2 (RECIPE.md and preview.png exist; the empty-home rebuild by a fresh agent is not done) `gui/RECIPE.md` (what it shows, the `keys.json` fragment for `mod.open`, the optional floating-block layout recipe, what the mod runs
      and reads) and `gui/preview.png` from `herdr-app shot`. Verify: a fresh agent builds the mod from the recipe in an empty home and `herdr-app check` passes.

## 6. Visual test (before anything is pushed)

- [x] 6.1 In a throwaway session (`docs/research/studies/2026-11-07-gui-spikes/scripts/isolated-env.sh`): fake agent terminals in each status,
      the daemon with a stub writer (no model tokens). Check and screenshot: chip count and colour, overlay sections, a rewrite appears without
      reopening, blocked colour, the daemon survives closing the window, `ensure` twice leaves one daemon. Stop the scratch window and core afterwards.
- [ ] 6.2 (this is roadmap P4's proof; not started) One real claude agent, with the maintainer's agreement: a real recap in the overlay; settle whether `/compact ` typed, then guidance
      pasted, then Enter runs.

## 7. Docs and release

- [x] 7.1 README "Desktop app (herdr-app)" section (start, transport switch, local API, files, what the mod shows, what is missing) and ROADMAP; no private host or tool named.
- [ ] 7.2 `doctor` reports the `hc` version and the tested range. Verify: a test with an out-of-range fake.

## 9. Engine seam, document and locked UX (done)

- [x] 9.1 S0: the engine takes a `Fleet` and a `Frontend`; the desktop frontend plugs in through one seam and its own entry points (`bin/tab-recap-desktop.ts`).
- [x] 9.2 P1: the document carries what the expanded view reads (version 2; `schema/gui-tab.v2.schema.json`).
- [x] 9.3 UX lock and port: the clickable mockup (`ux-mockup/`) is the final view; `gui/` draws chip, pane strip, Fleet and Brief. The 22 renders in `visual-test/final/` are the baseline.

## 10. Transport (R-2026-11-08-01; design in `transport.md`)

- [x] 10.1 T0 spikes: localhost `fetch` from a mod works; core socket path rule; event kinds captured; clipboard write exists; the ledger has no reopen.
- [x] 10.2 T1 `HcCore`: typed socket client behind `Fleet` and `Agents` (`TAB_RECAP_HC_TRANSPORT=cli|socket`, default `cli`). Verified on an isolated core: 0 hc spawns in 90 s idle against 21 on the CLI path.
- [x] 10.3 T2 `DesktopBus` and `DesktopApi`: loopback HTTP with a token file, long poll, open leases. Verified by curl.
- [x] 10.4 T3 the mod reads the API with the files as the fallback (`gui/api.js`, `gui/feed.js`, `gui/store.js`). Verified end to end on an isolated stack; the fallback and the recovery were exercised.
- [x] 10.5 T4 and T5, daemon side: `POST .../needs/:id/answer`, `GET .../compact-message`, `GET .../handoff-message`, with tests.
- [ ] 10.6 T4 and T5, mod side: Mark done and Copy exist in `gui/`; a visual run in the isolated app (before, after, refused, API down; message, note, copied) and then the maintainer's click-through on the live app are pending.

## 11. Later phases (see `roadmap.md`)

- [ ] 11.1 P3 notices: the daemon appends notices and the mod posts toasts. The bus topic `notice` exists and has no producer.
- [ ] 11.2 P4 typing into agents over `terminal.keys`, `terminal.send` and `terminal.wait` (needs the live proof of task 6.2). Enables Compact and Reply.
- [ ] 11.3 P5 settings and diagnostics.
- [ ] 11.4 P6 coverage: codex, opencode and hermes session lookup, locale, multi-task headers, remote machines.
- [ ] 11.5 P7 install: one installer step, then `openspec archive gui-port`.
- [ ] 11.6 P8 parity walk: the TUI list in `roadmap.md` section 1 against the desktop app, row by row.

## 8. Archive

- [ ] 8.1 Once every other task is checked, run `openspec archive gui-port` in the same merge request.
