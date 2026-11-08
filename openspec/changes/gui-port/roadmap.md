# Roadmap: everything the terminal UI does, in the desktop app

Written 2026-11-07 after the first desktop build (overlay, chip, per-tab JSON, own daemon). Sources: the README and `CONTEXT.md`
(read in full by a subagent), the renderers under `src/recap/render/`, `src/column/`, `src/recap/application/expanded-view.ts`
and the decoder and watch set (read by a second subagent), and the desktop build itself. The two inventories are **reported**, not
re-measured by me; the gap list in section 3 was checked against `GuiTab`, which I wrote.

## Status on 2026-11-08

| Item | State |
| --- | --- |
| S0 the engine seam (`Fleet`, `Frontend`) | done |
| P1 document v2 | done |
| P2 the overlay | replaced by the locked UX (chip, pane strip, Fleet, Brief), ported to `gui/`; 22 renders kept in `visual-test/final/` |
| Transport T0 spikes | done (R-2026-11-08-01, follow-up 2026-11-08) |
| T1 socket client behind `Fleet` and `Agents` (`TAB_RECAP_HC_TRANSPORT`) | done, verified on an isolated core |
| T2 `DesktopBus` and `DesktopApi` | done, verified by curl |
| T3 the mod on the API, files as the fallback | done, verified end to end on an isolated stack |
| T4 Mark done and T5 compact message, daemon side | done, with tests |
| T4 and T5 in the mod (verification) | pending: isolated visual run, then the maintainer's click-through |
| P3 notices | pending |
| P4 typing into agents over `terminal.keys`, `terminal.send`, `terminal.wait` | pending, needs the live proof first |
| P5 settings and diagnostics | pending |
| P6 coverage | pending |
| P7 install and release | pending |
| P8 parity walk | pending |

The architecture of the transport is in `transport.md`. Phases 1 and 2 below are kept as written; section 2 and the gap table describe the
first build, before the locked UX, and are history.

## 1. What the terminal UI shows (the requirement)

Surfaces: the **column** (and the **bar**, one row for narrow tabs), the **expanded view** (modal), the **compaction note popup**, the
**settings modal**, and **notifications**.

| Surface | Draws |
| --- | --- |
| Column, per lane | title (recap cursor, else lane title, else pane id); status badge `working`, `blocked — needs you`, `idle`, `done`, `unknown`; `<agent> <pane>` and "from screen"; the compaction hint (`compact? 45% of 1M`, at or above `TAB_RECAP_COMPACT_HINT`); the compaction stage line; notes (pane alerts, git note `⎇ branch · N unpushed · N changed`, token notes); last prompt (2 lines) |
| Column, per tab | meta line (`recap` title, "ago", backend, `⟳ updating`, plugin version, `daemon vX — restart`); the task body or the lane's own recap or "No recap yet… press r"; `recap: <error>` in red; one block per task when there are several; warnings (database newer, extension warnings); a footer of key hints |
| Bar | 📝, one dot per lane, one headline (needs-you first, else now, else the lane's own recap) |
| Expanded view | SESSION SO FAR (story, time, `updating…`), GOAL, NOW, NEEDS (with "waiting N"), DECISIONS (time, reason, `closed: why`), TIMELINE (done and closed facts, day separators, chapter breaks `── compacted a → b ──`, `── new session ──`), NEXT, RULES, LINKS (clickable refs), SESSION facts (started, turns by cause, compactions, chapters, context share per agent, repo and branch, files edited, autocompact decisions); two columns at 140 columns or more |
| Compaction | stages `✎ briefing`, `◐ compacting` (queued), `◐ restoring`, `✓ compacted a → b · n s`, `✗ failed`, `? unconfirmed`, `– skipped` |
| Actions | `refresh` (r), `show`, `column`/`columns` (hide, show), `compact` (c, with a note up to 280 characters), `handoff`, `autocompact`, `configure` (settings modal), `status`, `start`/`stop`/`toggle`; scroll keys; ctrl-click on links |
| Notifications | compaction start and end, autocompact `(auto)`, "no recap writer found", "database newer", handoff and compact refusals |
| Settings | the list in the README (language, git note, compact hint, retention, models, autocompact, events, pipeline…) |
| Events it reads | `pane.created/updated/closed/moved`, `pane.agent_detected`, `pane.agent_status_changed`, `tab.focused/closed`, `layout.updated`; resync on stream end, every 10 ticks, and a 300 s watchdog |

## 2. What the desktop app has today

Overlay for the tab in view (follows focus on render and on a 15 s timer), chip with count, worst status and daemon state, lanes
with status, agent, branch, context percent and last prompt, the seven sections as lines, freshness line, Refresh button (unverified),
own daemon and database, per-tab JSON written on every view change and every recap run, `show --json`. Live-checked in the real app.

## 3. Gaps, from the TUI list to the desktop

| TUI element | Desktop state | Work |
| --- | --- | --- |
| RULES section, decision reasons, `closed: why`, fact times | not in `GuiTab` | add facts (id, text, at, why, closedWhy) per section |
| TIMELINE, day separators, chapter and compaction breaks | missing | add the timeline items from the ledger |
| SESSION SO FAR (story, `updating…`) | missing | add story text, time, curating flag |
| NEEDS waiting time | missing | derive from the fact's open time |
| SESSION facts (started, turns, compactions, chapters, files, context per agent, autocompact) | missing | reuse `ExpandedModel.read`; carry its numbers as data, not text |
| Compaction hint and stage line | missing | add the stage record per lane and the hint rule |
| Git note counts, pane alerts, token notes, "from screen" flag | only the branch | add counts and notes to the lane |
| Meta line (backend, version, stale daemon) | partly (freshness only) | add backend, plugin and daemon version, a restart action |
| Multi-task blocks | tasks listed, names hidden when one | show task headers always when more than one |
| Warnings (database newer, extension warnings) | missing | add a `warnings` list |
| Bar | not needed on a desktop, the chip is the equivalent | decide: skip, or a compact overlay |
| Expanded view layout, scroll, links | one narrow column | a wide window with two columns, scroll, link opening |
| Settings modal | missing | a settings face reading and writing the config |
| Notifications | the app posts its own "needs you"; nothing for compaction or refusals | a notices file the mod turns into toasts |
| Typing into agents (compact, handoff, autocompact) | off | see phase 4; needs a live proof first |
| Session lookup for codex, opencode, hermes | claude only | cwd and newest transcript |
| Locale (`es`) | English only | read `TAB_RECAP_LOCALE` and reuse the message tables |
| Tab switch while the overlay is open | updates on the next render or timer | subscribe to focus changes |

## 4. Phases

Each phase ends with `bash ci/lint.sh` and `bash ci/test.sh` on Bun 1.4.4, a visual run in the isolated session (screenshots kept
under `openspec/changes/gui-port/visual-test/`), and one merge request with one `changelog::` label. Nothing is pushed before the
visual run of that phase passes.

**Phase 1: the document carries everything the expanded view reads** (`changelog::added`, done)
Build `GuiTab` v2 from the same model the expanded view uses, so the two cannot drift: facts with times and reasons, timeline,
story, session facts, compaction stage and hint, notes, warnings, versions, backend. Bump `version` to 2, keep a reader for 1 in the
mod, extend the schema and the tests (including the 1 MiB cap: cap the timeline, never drop a section silently).
Done when: `show --json` for a real tab carries every row the TUI modal draws, and a test compares the two for one fixture.

**Phase 2: the overlay draws it** (`changelog::added`, replaced by the locked UX in `gui/`: see `ux-plan.md`)
Two views in one mod: **Recap** (the column: lanes, sections with the TUI caps, meta line, error, "No recap yet") and **Full** (the
expanded view: two columns at width, timeline, decisions with reasons, session facts). Scroll, keyboard (j/k, g/G, r, Esc), theme
colours incl. light, links opened through `exec` (`xdg-open`), a stale-daemon notice with a restart button, tab switch handled by
polling `focused()` on a short timer while the overlay is open.
Done when: for one live tab the overlay and the TUI modal show the same sections, and a screenshot of each state is kept (working,
blocked, idle, done, running, error, no recap, stale daemon, compaction stage).

**Phase 3: notices** (`changelog::added`, pending; the bus topic `notice` exists, nothing publishes to it)
The daemon appends to `<state>/gui/notices.jsonl` (needs you, compaction start and end, refusals, no writer, database newer); the
mod watches it and posts toasts with `notify`, never repeating one and never duplicating the app's own "needs you".
Done when: a blocked fake agent and a refused action each raise one toast.

**Phase 4: typing into agents** (`changelog::added`, after a live proof; pending). The transport is now the core socket: `terminal.keys`, `terminal.send`, `terminal.wait`.
Proof first (task 6.2, with the maintainer's agreement, one throwaway agent): `hc keys` can type `/compact ` (letters, `/` and space
are allowed), `hc send` pastes guidance and presses Enter. Check that Claude, Codex and opencode run it. Then implement `HcAgents.prompt`,
`typeLine` and `askNote` with that sequence, enable compaction, handoff and autocompact for the desktop frontend, and add the c key
and a note popup to the overlay. Guidance text with characters `hc keys` rejects stays pasted, never keyed.
Done when: a compaction runs from the overlay on a throwaway agent and the stage line walks briefing, compacting, compacted.

**Phase 5: settings and status** (`changelog::added`, pending)
A Settings face (models, language, git note, compact hint, retention, autocompact) reading `config.env` and writing it through the
existing `set` path; `status` and a check of the `hc` version against the tested range (0.1.x) in a Diagnostics face.
Done when: a change in Settings changes the next recap or view and survives a daemon restart.

**Phase 6: coverage** (`changelog::added`, pending)
Session lookup for codex, opencode and hermes; locale; multi-task headers; remote machines (tab ids carry the machine prefix);
the optional bar-style headline in the chip's tooltip or text.

**Phase 7: install and release** (`changelog::docs` then archive, pending)
One installer step (`tab-recap desktop install`: copies `gui/`, writes the `tab-recap` launcher, optionally adds the key binding and
the chip layout as an opt-in clone, never editing a shipped layout), README and `RECIPE.md`, `openspec archive gui-port`.

**Phase 8: parity walk** (pending)
Go through section 1 row by row against the desktop app, with a real tab, and write down each row as drawn, missing or not wanted.

## 5. Bugs and unknowns carried into the roadmap

- Refresh button and the chip click were not exercised by a click, only by command.
- Overlay tab switching is render and timer driven; confirm it follows a click on another tab.
- A tab whose program is a plain terminal shows "No agent in this tab yet"; confirm against a tab that has an agent but reports no status.
- Merge order: the Fleet interface and vocabulary first (`internal`), then the desktop frontend, then each phase.
- Open question for the maintainer: should the desktop app ever draw a bar, or is the chip enough?
