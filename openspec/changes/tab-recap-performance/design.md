# Proposal — tab-recap performance, fixed at the root

Lane opus-tabrecap (architect, proposal only). 2026-10-14. Code read at `atalaya` = `2d1b9c5` (main `658b42d`; one open MR, !139 handoff
follow-ups, which does not touch these files). Probes were read-only and light (`ps`, `/proc`, one `herdr pane list`, a few `git status` timings,
a daemon.log parse). Raw data is in `tabrecap-perf/` (`panes.json`, `recaps.txt`, plus the parent's files).

## Verdict in one paragraph

There is **no process leak**: 28 live column processes for the 28 tabs that have an agent, which is correct. There is a **pane leak**: herdr's
session restore brings plugin panes back as plain shells, and the daemon cannot see them. The cost comes from the **shape of the plugin**.
Every column is a complete copy of the app. Once a second it re-reads the database and the config, and it polls git (status every 5 s plus three
more git calls every 10 s) and herdr (`pane.get` every 3 s) for its own lanes. 28 columns therefore poll the same worktrees 28 times. The fix at
the root: **one daemon owns every read and gets updates from events, and the columns become dumb terminals** that paint frames the daemon pushes.
Measured and estimated effect: git status calls/min **≈ 336 → ≈ 15**, column RSS **5.8 GiB → ≈ 1.1 GiB**, column CPU **≈ 45 % → < 5 %**,
summaries **≈ −40 %** (a debounce window the code already has, set to 120 s).

## 1. Process model

### Measured

| what | count | evidence |
| --- | --- | --- |
| herdr panes | 142 | `herdr pane list` |
| tabs with an agent | 28 | same |
| live columns (`node src/column/launch.mjs`, direct children of herdr) | 28 | `ps`; one per agent tab |
| **restored dead columns** (label `Recap`, cwd = plugin root, title = shell prompt, `revision 1`, a `zsh` with no child) | **73** | all 73 `zsh` started **2026-10-12 16:26:01–09**, the same second as `herdr server` |
| plugin-cwd panes per tab | 1 ×10 tabs, 5 ×12, 6 ×5 | so a tab gains one dead pane per herdr restart and carries it into every later restore |

### Root cause

When the session is restored, herdr recreates every pane, including plugin panes, as a **shell in the saved cwd**. It does not re-run the
plugin's command. A dead column keeps its `Recap` label but its title becomes the shell prompt. `columnsIn()`
(`src/adapters/column-panes.ts:18-30`) accepts a column only if the title is exactly `tab-recap`, so the fold sees a tab without a column and
opens a new one. The red line (only `tab-recap` titles may be closed) correctly stops the daemon from closing what it cannot recognise. That is
how the 73 shells pile up.

### Options

- **A. Recognise a restored column, then retire it** with a new intent `retire-restored-column`. A pane is a restored column only when ALL of
  these hold: label `Recap`; `cwd` equal to the plugin root; no agent; title not `tab-recap`; `pane.process_info` shows only a login shell with
  no child process. The fold closes it and the column is reopened as usual. This **amends the fifth red line**. It stays safe because the
  identity is strictly narrower than "any shell": no agent, our label, our cwd, idle shell. It must be checked three times, the same as the
  existing rule (column-panes, fold, `HerdrFleet.close` re-check).
- B. Type the column command into the restored shell. Rejected: `recap-never-types`.
- C. Upstream: ask herdr to re-spawn plugin panes on restore, or to drop them. File the issue in any case. A herdr fix makes A dormant, not
  wrong.

**Recommend A plus C upstream. A lands last** and is off by default (`TAB_RECAP_RETIRE_RESTORED=off`). By the operator's decision
(2026-10-14), the 73 stale panes stay open: they are part of the baseline, and the fix is judged on the same panes before and after (§5).

### Target process model

| option | what | verdict |
| --- | --- | --- |
| O1 tune the columns (longer TTLs, caches) | 28 copies of the same polling, only slower | rejected: does not fix the root |
| O2 daemon writes a per-tab view into the DB, columns read it on `PRAGMA data_version` | still a poll in every column, and still TS, SQLite and the module graph in every column | second best |
| **O3 the daemon renders, the column is a terminal** | the daemon owns every read (git, herdr tokens, bridge log, config, DB), builds `ColumnView`, renders the lines at the width the column reported and **pushes the frame** over a unix socket in the state dir. The column is one plain `.mjs` file: connect, report its size, paint frames, forward keys and taps. The daemon maps them to the existing `Requests` queue. It reconnects when `fs.watch` on the state dir sees the socket again. | **recommended** |

O3 keeps the layering. The domain fold is untouched. `present()`/`presentBar()` are already pure, so they move from the column composition root
into the daemon, and a new `ColumnFrames` port carries frames. Relative times ("3 min ago") get one repaint per minute from a daemon timer, sent
only to tabs whose view shows a relative time. That timer does no I/O. The version roll (`rollWhenUpgraded`) goes away: the column file is tiny
and stable, and the daemon's own restart is the upgrade.

## 2. Change detection instead of polling

### Today (per column, per lane, while the column is alive)

- `git-note.ts:123`: `git status --porcelain=v2 --branch` every `TTL_MS = 5000`, or sooner when the `HEAD`/`index` mtime changes. `stamp()` is
  a `statSync` once a second.
- `git-lane-repo.ts:9,66`: `rev-parse`, `symbolic-ref` and `remote get-url` every `REPO_TTL_MS = 10 000`.
- So per lane: 12 status + 18 other git calls a minute. With 28 lanes that is **≈ 336 status/min and ≈ 840 git spawns/min (≈ 14/s)**.
  Six columns sit in `infrastructure` and each runs its own status.
- Cross-check: 336/min × ≈ 150 ms mean ÷ 60 s ≈ **0.84 concurrent**. The parent sampled 0.8. The model explains the measurement.
- `token-notes.ts:9,53`: `pane.get` per lane every 3 s, ≈ 9–10 RPC/s into herdr. Each RPC is a new socket connection, which counts toward
  herdr's ≈ 30 % CPU.
- `atalaya-bridge.ts:106-113`: 28 columns each re-read and re-parse the **whole** 1.1 MB `atalaya-log.jsonl` on every append.
- `column/main.ts:22,85`: every second, `readTab` + `readRecap` + `shownFor` from SQLite and `loadConfig()` (a `readFileSync`). Every 3 s,
  another `loadConfig()` + `codeVersion()`, which reads the toml.

### What a status costs, and why (delivery-handbook `e31-r4`, 4 441 tracked files, 0 untracked)

| command | ms (2 runs) |
| --- | --- |
| `status --porcelain=v2 --branch` (today) | 525, 869 |
| `… --untracked-files=no` | **43, 74** |
| `-c core.untrackedCache=true …` with `GIT_OPTIONAL_LOCKS=0` | 1 033, 654 (the cache is never written, so it never helps) |
| `rev-parse --show-toplevel` | 10 |

`GIT_TRACE2_PERF`: of 0.80 s, the **untracked scan is 0.61 s**; preload and refresh take 0.18 s. git documents this trade-off in the
"UNTRACKED FILES AND PERFORMANCE" section of git-status [1]. The untracked cache is stored in the index [2], so writing it is a write into the
user's repository. That is forbidden by `recap-no-foreign-write`, and `GIT_OPTIONAL_LOCKS=0` [3] (which we keep) prevents the write anyway. We
may **use** `core.untrackedCache` or `core.fsmonitor` where the operator has enabled them in a repo, but we must never turn them on ourselves.

### Design (in the daemon)

1. **One `WorktreeStatus` per worktree root**, not per column. Key: `--show-toplevel`, resolved once per pane cwd. The cwd comes from herdr's
   pane snapshot and events, so it changes only when the pane's cwd changes. About 20 distinct worktrees for 28 lanes today.
2. **Triggers (notices):**
   - `fs.watch` (inotify) on the git dir's `HEAD`, `index`, the current branch ref and `packed-refs`; for a linked worktree, the worktree
     git dir plus the common dir's refs. These are about five watches per worktree, never the working tree: node_modules would cost
     thousands. Coalesce: 500 ms trailing, at most one in flight per worktree.
   - **Turn ended** (`pane.agent_status_changed` working → idle/done, which the daemon already subscribes to). An agent's edits do not touch
     the index, and the turn is the unit the recap works in anyway.
   - **Safety refresh** every 120 s, only for worktrees whose column is visible.
3. **Two tiers:** run tracked-only (`--untracked-files=no`, ≈ 50 ms) on every git-dir event. Run the untracked count (`-unormal`) only on turn
   end and on the safety refresh. Branch, ahead and oid come from the `# branch.*` headers that status already prints. This removes
   `GitLaneRepo`'s periodic three calls: root, branch and origin are read again only when the cwd or `HEAD` changes.
4. **Herdr tokens from events:** `pane.updated` exists in herdr's API schema (protocol 22), and `PaneInfo` carries `tokens`. Fold the tokens
   from that event into the daemon's board and drop `pane.get` polling. *Check first*, in a scratch workspace, that `pane.report_metadata`
   emits `pane_updated`. If it does not, read tokens once per `RESYNC_MS` (60 s), not every 3 s per lane.
5. **Bridge log:** one `fs.watch`, and read from the last byte position (tail), not the whole file.

**After (estimate, from the measured turn rate):** turn-end ≈ 1/min across the fleet, plus git-dir events, plus 20 worktrees / 2 min ≈ **≈ 15
status/min, ≈ 12 of them with the untracked scan** (vs 336). Steady-state `rev-parse`/`symbolic-ref`/`remote`: 0. herdr RPC from the plugin:
events plus one resync a minute (vs ≈ 600/min).

## 3. Summaries (`claude -p --model claude-haiku-5-5`)

Measured from `daemon.log`. The summary path itself is unchanged.

| metric | value |
| --- | --- |
| recaps, last 40 h | 2 384 → **59/h** (110/h in the busy window 13–16 UTC today) |
| cause | 312 of 333 (13–16 UTC) `turn-ended`; 16 focused; 5 requested |
| duration | mean 14.3 s |
| concurrency today | mean **0.29**, max **5** claude processes. Each live `claude` is ≈ 300 MiB RSS, so 5 at once is ≈ 1.5 GiB of spikes |
| busiest tab | `w21:tN`: 140 recaps |
| also | curator 32 / 3 h (LLM); autocompact decisions 291 / 3 h (Jev, remote, cheap locally) |

The trigger is every turn end, after `TURN_SETTLE_MS`. A debounce already exists (`TAB_RECAP_RUN_DEBOUNCE_MS`, 5–300 s,
`recap-job.ts:92-104`) but is **off** by default. Replaying the 40 h log with "at most one recap per tab per window":

| window | recaps | fewer |
| --- | --- | --- |
| 60 s | 1 755 | 26 % |
| **120 s** | 1 404 | **41 %** |
| 300 s | 933 | 61 % |

**Recommend:**
- Default `TAB_RECAP_RUN_DEBOUNCE_MS=120000`. Forced causes (requested, focused, a lane set change) still bypass it.
- **Global cap: 2 summaries in flight.** A grep found no global cap; confirm when implementing.
- **Skip when the transcript delta since the last recap has no new user or assistant text** (tool noise only). Count the skip as a job.

Expected: ≈ 35–40 % fewer summary runs and spikes ≤ 2 × 300 MiB. **Tokens:** not in the log today. Add input and output tokens to the
`written in` line (telemetry tags are on), so that this number is measured next time, not guessed.

## 4. Memory

| measurement (node 24.21, this host) | RSS |
| --- | --- |
| bare `node` with an `fs.watch` | 34 MiB |
| + one `.ts` import (type stripping loads its transformer) [4] | 51 MiB |
| + column module graph (render, db, extensions) | 83 MiB (heap only 12 MiB) |
| live columns, started 08:58 | 108–290 MiB, **≈ 215 avg**; `RssAnon` 63–244 MiB |
| daemon | 652 MiB (`RssAnon` 617) |

A column costs ≈ 50 MiB of code that it does not need (TS transformer, SQLite, every extension). On top of that, its V8 heap grows from the 1 Hz
churn: full DB reads, JSON parses, re-renders and extension work. V8 has gigabytes of headroom, so it has no reason to compact. **Target for an
O3 column: ≤ 45 MiB.** It is plain `.mjs` with no TS, no SQLite and no extensions, launched with `--max-old-space-size=32` as a guard. 28 × 45 ≈
**1.2 GiB vs 5.8 GiB**. The 73 dead `zsh` panes also go, along with herdr's per-pane terminal state.

The daemon's 652 MiB is **not explained yet**. Take one heap snapshot (`--heapsnapshot-signal`) of a daemon that replays a copy of the DB in a
scratch session **off CT 103**, then set its budget. Provisional target: ≤ 400 MiB.

## 5. Budget and proof

### Budget (CT 103, ≈ 30 agent tabs)

| item | budget | today |
| --- | --- | --- |
| plugin panes | = tabs with an agent | 101 for 28 |
| column RSS / CPU (all) | ≤ 45 MiB each; ≤ 5 % of one core total | ≈ 215 MiB each; ≈ 45 % |
| daemon RSS / CPU (excl. summarizer children) | ≤ 400 MiB; ≤ 10 % avg | 652 MiB; 12 % avg over 9.5 h |
| git status / min (fleet) | ≤ 20, ≤ 0.1 concurrent | ≈ 336, 0.8 |
| other git / min, steady state | 0 | ≈ 500 |
| herdr RPC from the plugin | events + ≤ 1 resync/min | ≈ 600/min |
| summaries | ≤ 40/h avg, ≤ 2 in flight | 59/h, max 5 |

### Proof: same panes, before and after

**Baseline (parent, 11:08, `tabrecap-perf/measure.sh`, 60 s, three tools):** 29 tab-recap processes = **119.9 CPU-s per 60 s** (200 % of a
core, 58 % of the LXC's 206 CPU-s) including reaped git children; RSS **6 648 MiB**; **223 git status** seen in 60 one-second samples (≈ 3.7
running at once at that moment); load 27.9. The data is in `tabrecap-perf/baseline-20261014T1108/`.

**After:** rerun `measure.sh <outdir> 60` unchanged, on the same 142 panes (the 73 stale shells stay open), at a comparable load. Run it 3
times and report the median against the baseline. The plan keeps three things so that `measure.sh` still sees the same processes:

- **The column's entry stays `src/column/launch.mjs`**, so the script's `pgrep` pattern still matches. MR 3 replaces what it imports, not
  its path.
- **Every status call keeps the prefix `git -c core.fsmonitor=false status`**, so the script's sampling pattern still counts it. A silent
  rename would show 0 and fake a win.
- **The daemon stays `src/daemon/launch.mjs`.**

**Targets on `measure.sh`:** tab-recap CPU-s per 60 s ≤ 12 (≤ 20 % of a core, −90 %), RSS ≤ 2 GiB, git status samples ≤ 15. Summarizer
`claude` children are not in the script's pid list today, so the summary effect is measured from `daemon.log` (recaps/h, max in flight) over
the same 24 h before and after.

**Added tools, alongside `measure.sh`, not instead of it:**

1. **Counters, not sampling:** the daemon counts its git spawns (by kind), RPCs, summaries and frames pushed, and prints them per minute in
   `tab-recap status --perf`, along with its own RSS and CPU and each column's (from `/proc` via the Host port). A one-shot read is allowed on
   CT 103 because it is a status read, not a test.
2. **Benchmark on the CI runner, never CT 103:** `ci/perf-bench.sh` starts the daemon against a fake herdr (the fakes `test/` already has) with
   30 lanes across 20 temp repos. Six of the repos carry a 5 000-file ignored tree. The run scripts turn-ends for 5 minutes and asserts the
   counters stay within the budget above. It runs in a separate CI job, path-scoped to `tab-recap/src/**`.

## 6. Plan

**Where:** one OpenSpec change in `homelab/herdr-plugins`, `openspec/changes/tab-recap-performance/`, ending with its own Archive MR. Three
landings, each one reversible on its own:

| # | MR | files | reversible by |
| --- | --- | --- | --- |
| 1 | **Summary budgets that cost nothing**: `TAB_RECAP_RUN_DEBOUNCE_MS` default 120 000; global summary cap 2; skip on no new text; tokens in the log line | `src/daemon/config.ts`, `src/recap/application/recap-job.ts`, README | config (`TAB_RECAP_RUN_DEBOUNCE_MS=0`); revert MR |
| 2 | **Worktree status in the daemon, from events**: `WorktreeStatus` registry + port, git-dir watcher (adapter), two-tier status, tokens from `pane.updated`, bridge-log tail. Columns still render (for now) from a daemon-written `notes` table instead of their own extensions | new `src/ports/worktree-status.ts`, `src/adapters/git-worktree-status.ts`, `src/adapters/git-dir-watch.ts` (the only `fs.watch` on foreign files: read-only), `src/extensions/git-note.ts` (to the daemon), `token-notes.ts`, `atalaya-bridge.ts`, `src/adapters/db/` + migration for `lane_note`, `src/daemon/main.ts` | `TAB_RECAP_GIT_NOTE=off`; revert |
| 3 | **Daemon-rendered columns (O3)**: `ColumnFrames` port, socket adapter, the column becomes `src/column/terminal.mjs` (plain JS; host policy kept); manifest `[[panes]] column` points at it; `present()` called by the daemon | `src/ports/column-frames.ts`, `src/adapters/column-socket.ts`, `src/daemon/columns.ts`, `src/column/terminal.mjs` (+`.d.mts`), `herdr-plugin.toml`, delete `src/column/main.ts` paths it replaces, `.dependency-cruiser.cjs` (column imports nothing from src) | keep `src/column/launch.mjs` for one release behind `TAB_RECAP_COLUMN=classic` |
| 4 | Perf probe + bench + daemon heap investigation | `bin/tab-recap.mjs status --perf`, `ci/perf-bench.sh`, CI job | n/a |
| 5 | **Retire restored columns (§1A)**, off by default (`TAB_RECAP_RETIRE_RESTORED`), turned on only after the after-measurement | `src/adapters/column-panes.ts`, `src/recap/domain/fold.ts` (+`Intent`), `src/recap/application/dispatch.ts`, `src/adapters/herdr-fleet.ts` (close re-check + `pane.process_info`), `test/fold.test.ts` golden sequences, CLAUDE.md red-line text | config off |

Order: 1 → 2 → 3 → **`measure.sh` after-run on the same panes** → 5. Item 4's counters land inside 2, since 2 and 3 need them to show their
numbers. Run `measure.sh` again after each of 1, 2 and 3 to attribute the gain to each one: three 60 s reads, allowed on CT 103. Coders: Haiku
with medium effort for 1, 4 and 5. Use high effort for 2 and 3, because they are foundation changes (domain, ports, process model).

## Questions for the operator

1. ~~Close the 73 stale shells first?~~ Answered 2026-10-14: no. They stay as the baseline (§5).
2. **Amend the fifth red line** (MR 5, after the after-measurement) so the daemon may close a *restored column* under the five-fold identity in §1A?
3. **Debounce 120 s default:** OK? It means a recap may lag up to 2 min behind a fast-turning agent. Focused or requested recaps are still
   immediate.
4. **Untracked count only at turn end and every 2 min:** OK? In between, the `⎇` note may undercount new untracked files.
5. Should I open the herdr upstream issue (plugin panes restored as shells)?

## Sources

1. git-status, "UNTRACKED FILES AND PERFORMANCE": https://git-scm.com/docs/git-status#_untracked_files_and_performance
2. git-update-index, "UNTRACKED CACHE" (stored in the index): https://git-scm.com/docs/git-update-index#_untracked_cache
3. git, `GIT_OPTIONAL_LOCKS`: https://git-scm.com/docs/git#Documentation/git.txt-codeGITOPTIONALLOCKScode
4. Node.js, "Modules: TypeScript" (type stripping): https://nodejs.org/api/typescript.html
5. herdr API schema, protocol 22 (`herdr api schema --json`): `pane.updated`, `pane.exited`, `pane.process_info`, `PaneInfo.tokens`/`restore_error`
6. Local: `src/extensions/git-note.ts:16-18,123`, `src/adapters/git-lane-repo.ts:9,14,66`, `src/extensions/token-notes.ts:9,53`,
   `src/extensions/atalaya-bridge.ts:106-113`, `src/column/main.ts:22-23,85,215`, `src/adapters/column-panes.ts:18-30`,
   `src/recap/application/recap-job.ts:92-104`, daemon.log `~/.local/state/herdr/plugins/tab-recap/daemon.log`
