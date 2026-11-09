# Document v2: what `GuiTab` carries so the overlay draws every row the TUI draws

Design only. No source is written by this document. Paths are relative to `tab-recap/`; `file:line` was read on branch
`research/gui-port` (base `92a444a`). Everything not read is listed in section 6.

## 0. Principles

- **The TUI model is the source.** The expanded view is `ExpandedModel.read(tab, view, now)` (`src/recap/application/expanded-view.ts:58`)
  plus the column's `ColumnView` (`src/column/main.ts:87-92`). v2 carries their numbers and records as data. Rendered strings are
  carried only where the TUI renders them with a locale table (break text, stage line), next to the structured fields they came from.
- **Additive over v1.** Every v1 field keeps its name, type and meaning (section 5). `version` becomes `2`.
- **Times are epoch milliseconds (`Instant`)**; the mod computes "waiting 4 min" / "ago" from them and its own clock, so the
  file need not be rewritten every second. The one exception is the day separator and clock labels, which need a time zone: they are
  precomputed in the daemon's zone and the zone is carried (`zone`).
- **Domain rule 3**: every new field below is a branded domain type (`Count`, `Instant`, `Text`, `NonEmptyText`, `PaneId`, `TabId`,
  `FactId`, `AgentKind`, `Directory`) or a union of literals / object of those. Booleans are carried as `'yes' | 'no'`-style literal
  unions only where an existing type in `src/recap/domain/` already does that; otherwise a branded `Flag` is added in a new file
  (a bare `boolean` would trip the ratchet). Where this document writes `Flag`, that is the new brand.
- **Open/closed**: all new types go in new files (`src/recap/domain/gui-tab-v2.ts`, `gui-fit.ts`; `src/recap/application/gui-tab-v2-build.ts`,
  `gui-tab-regions.ts`, `gui-tab-lanes.ts`; `src/adapters/gui-model.ts`). `gui-tab.ts` and `gui-tab-build.ts` are branch-created and
  may be edited to bump the version and compose the new parts; they must stay under the 250-line oxlint cap, so the new parts live in
  the new files.

## 1. Element table

Legend: *TUI cap* = a limit the TUI applies that v2 must reproduce (or carry the raw list and the cap value). "Not capped" means the
renderer draws every item (wrapping is not a cap). "Fact" below is `Fact` (`src/recap/domain/fact.ts:19-33` in file-relative terms:
`id, task, section, text, why, ref, agent, anchor, firstAt, lastAt, state, closedWhy, closedAt, language`).

### 1.1 Per task (expanded view)

| TUI element | v2 field (type) | Read from | TUI cap |
| --- | --- | --- | --- |
| Facts (every fact any region draws) | `tasks[].facts: GuiFact[]`, `GuiFact = {id: FactId, section: Section, text: Text, spans: GuiSpan[] \| null, why: Text \| null, ref: Text \| null, agent: Text \| null, firstAt: Instant, lastAt: Instant, state: 'open' \| 'closed', closedWhy: ClosedWhy \| null, closedAt: Instant \| null}`; `GuiSpan = {text: Text, url: Text \| null}` | `ExpandedData.tasks[].facts` = `ledger.allOf({tab, key: task.id})` (`expanded-view.ts:44`, returned `:55`) | none; v2 carries only facts some region draws (the union of the region lists below), the TUI's regions are the filter |
| Fact text with `agent · ` prefix | `text` is the bare text, `agent` separate; mod joins `agent · text` | `expanded-regions.ts:45` | none |
| Clickable refs inside fact text | `spans` (null when `linkify` yields no url), plus `lanes[].web` | `linkify(text, webs)` `links.ts:106`, `Segment` `links.ts:3`, `isSafeUrl` `hyperlink.ts:10`, `linked()` `linked.ts:5`; webs = `lanes.map(l => l.web)` (`expanded-view.ts:68`) | urls failing `isSafeUrl` are dropped |
| Fact `why`, `(not recorded)` | `why` null when absent or equal to the literal `(not recorded)` | `expanded-regions.ts:65,73` | none |
| GOAL | `tasks[].regions.goal: FactId[]` (0 or 1) | `newest(open(facts,'goal')).slice(0,1)` `expanded-regions.ts:123` | **1 fact**, newest `lastAt` |
| NOW | `regions.now: FactId[]` | `bullets(newest(open(facts,'now')))` `:127` | not capped; open only; `lastAt` desc |
| NEEDS | `regions.needs: FactId[]` (open, `firstAt` asc) | `needs()` `:58-63`, `open` `:42` | not capped |
| NEEDS waiting time | derived by mod: `now - fact.firstAt`; publish also carries `tasks[].needsWaitedMs: Count[]` (parallel to `regions.needs`, at publish time) as the fallback | `elapsed(draw.now - fact.firstAt)` `:60`, `elapsed` `wrap.ts:115` (units s/min/h/d) | none |
| DECISIONS (time, reason, `closed: why`) | `regions.decisions: FactId[]` (`firstAt` desc); `stamp` is derived by the mod from `firstAt` + `zone`, or carried as `GuiFact.stamp: Text` | `inDecisions` `:67` (section `decisions` and `closedWhy !== 'rewritten'`, open or closed), `decisions()` `:69-77`, `stamp()` `:49` (not exported) | not capped |
| TIMELINE rows | `tasks[].timeline: GuiTimelineRow[]`; `GuiTimelineRow = {kind: 'fact', fact: FactId, at: Instant, clock: Text, day: Text \| null, closed: ClosedWhy \| null} \| {kind: 'break', at: Instant, clock: Text, day: Text \| null, break: GuiBreak}` | `timelineOf(facts)` `timeline.ts:28` (sections `done` or state `closed`; `drawnAt` = `firstAt` for done, else `closedAt ?? lastAt`; `closed` = `closedWhy`), breaks from `ExpandedData.breaks` `expanded-view.ts:72`, merge and order `expanded-regions.ts:82-86` (`at` desc, break before fact on a tie) | not capped in the TUI; **capped in v2 by the byte policy (section 4)** |
| Day separators | `GuiTimelineRow.day` (`YYYY-MM-DD` or null) | `dateLines(times, now, zone)` `timeline.ts:35` (first row compares with today, later rows with the previous row) | none |
| Clock labels | `GuiTimelineRow.clock` (`HH:MM`, 24 h) | `clockOf(at, zone)` `timeline.ts:16` | none |
| Compacted / new-session break line | `breaks: GuiBreak[]` at tab level (the TUI draws the same list in every task's timeline); `GuiBreak = {kind: 'compacted' \| 'switched', at: Instant, trigger: 'auto' \| 'manual' \| 'plugin' \| null, tokensBefore: Count \| null, tokensAfter: Count \| null, tookMs: Count \| null, text: Text}` | `Break` `src/ports/boundaries.ts:3-10`; `text` = `breakText(break, messages.chapters)` `timeline-breaks.ts:13` (`new session`, or `compacted 120k → 20k · 1 min 5 s`); `tokensOf` `compaction.ts:94` | none |
| LINKS | `regions.links: FactId[]` (open, `lastAt` desc); display text = `text`, plus ` ref` when `ref` is set and not already inside `text` | `links()` `:99-104` | not capped |
| NEXT | `regions.next: FactId[]` | `:129` | not capped |
| RULES | `regions.rules: FactId[]` | `:130` | not capped (note: v1 `GuiSections` has no `rules`, `NO_SECTIONS` has it, `shape.ts:18`) |
| SESSION SO FAR: story text | `tasks[].story: {text: Text, spans: GuiSpan[] \| null, at: Instant} \| null` | `stories.read(tab, task.id)` `expanded-view.ts:45`; `Story` `src/ports/stories.ts:5`; `head()` `expanded-regions.ts:106-114` | not capped |
| Story "updating…" (curating) flag | `tasks[].curating: Flag` | `taskOf` `expanded-view.ts:47-55`: `stale && waiting !== undefined && now - waiting.at < CURATING_MS`; `CURATING_MS = 10 min` `:14`. Stale = newest `max(lastAt, closedAt)` over the facts (`newestChange` `:30`) is newer than `story.at` or there is no story | 10 min window |
| Task heading / grouping | `groups: {task: NonEmptyText \| null, lanes: PaneId[]}[]`; `tasks[].name`, `tasks[].id` (v1) | `groupsOf(lanes, tasks)` `groups.ts:9`; heading rule `name === '' ? taskNumber(at+1) : name` `present.ts:163`, `expanded.ts:62` (the mod owns the numbered fallback, the locale tables are phase 6) | single group when `tasks.length <= 1` |
| Task markdown (column body) | `tasks[].markdown: Text` redefined as the TUI's drawn markdown | `markdownOf(task, m)` `present.ts:123-128`: `sections === null ? task.markdown : renderRecap(sections, locale)`; `renderRecap` is exported from `recap-shape.ts` (imported `present.ts:13`). `markdownOf` itself is **not exported**: reimplemented in a new file (3 lines) | none |
| Sections as strings (column body "plain" path) | `tasks[].sections` v1 + new `rules: Text[]` | `RecapSections` / `NO_SECTIONS` `src/recap/domain/shape.ts:18`; v1 `guiSections` `gui-tab-build.ts:48` drops `rules` | none |
| Claude's own recap fallback | `claudeRecaps: Text[]` (tab level), shown when no task has markdown | `present.ts:141-144` (`recap.lanes[].claudeRecap`, `LaneCursor` `recap-records.ts:8`) | none |
| "No recap yet" / waiting for agent | derived: `tasks.length === 0`, `lanes.length === 0`; no field | `present.ts:145,170` | none |
| Recap error line | `error` (v1) | `errorLines` `present.ts:148-151` (`recap.error`, `recap-records.ts:19`) | none |
| Closed facts' reason in decisions / timeline | `GuiFact.closedWhy` (`done \| wrong \| superseded \| answered \| merged \| rewritten`) | `ClosedWhy` `fact.ts` (`CLOSED_WHY`), shown via `messages.expanded.closed(why)` `expanded-regions.ts:75,95` | `rewritten` hidden in decisions (`:67`) but still drawn in the timeline if closed |

### 1.2 Session facts (expanded view, last region)

All from `ExpandedData.session: SessionFacts` (`session-facts.ts:20-29`), built by `sessionFactsOf` (`session-facts.ts:47`) at
`expanded-view.ts:65-71`. v2 field: `session: GuiSession | null`.

| TUI row | v2 field | Read from | TUI cap |
| --- | --- | --- | --- |
| started (time + span) | `session.started: {at: Instant, forMs: Count} \| null` | `SessionFacts.started`; source `deps.session.firstSeen(tab)` (`expanded-view.ts:66`); drawn `session-lines.ts:46-49` (`spanOf` `:8`) | none; `forMs` fixed at publish, mod recomputes from `at` |
| turns, by cause | `session.runs: {total: Count, byCause: {cause: 'turn-ended' \| 'focused' \| 'requested', count: Count}[]} \| null` | `runsOf` `session-facts.ts:35` over `deps.session.runsByCause(tab)`; `RUN_CAUSES` `:5` | zero-count causes dropped |
| compactions (count, operator/auto, measured pairs) | `session.compactions: {count: Count, byOrigin: {operator: Count, auto: Count}, measured: {before: Count, after: Count}[]} \| null` | `compactionsOf` `session-facts.ts:41`, `deps.session.compactions(tab)`; drawn `session-lines.ts:28-40` | pairs only where both token counts are known |
| chapters | `session.chapters: Count \| null` | `chapterCount` via `deps.boundaries.chapterCount(tab)` `expanded-view.ts:69`; null unless `> 1` (`session-facts.ts` `chapters`) | shown only when more than 1 chapter |
| per-agent context share and window | `session.agents: {label: Text, share: Count, window: Count}[]` | `sessionFactsOf` agents, `shareOf` `compaction.ts:90`, `sizeOf` `:92` (window text `120k`/`1M` is derived by the mod, or carried as `windowText`); label = `agent · clipped(title)` | label clipped to **20 characters** (`LABEL_CHARS` `expanded-view.ts:15`, `clipped` `:33`); lanes with no context or `window <= 0` omitted |
| repo (+ branch) | `session.repo: {name: Text, branch: Text \| null} \| null` | `sessionFactsOf` repo: last path segment of the first non-null `lane.web.base` (`session-facts.ts:54`) | first web only |
| files edited | `session.files: {path: Text, count: Count}[]` | `edits` dep (`expanded-view.ts:25,68`) = `EditCache.of` (`edit-counts.ts:54`) over `EditCounts.of` (`:37`), `countEdits` sorts by count desc then path (`:13`) | **5 files** (`FILES_SHOWN` `session-facts.ts:31`, `.slice(0, FILES_SHOWN)`); the total is not available from `SessionFacts` (section 6) |
| autocompact counts | `session.autocompact: {decisions: Count, compacted: Count, waited: Count} \| null` | `deps.autocompact.countsFor(tab)` `expanded-view.ts:70`; null when `decisions === 0` | none |

### 1.3 Per lane (column)

| TUI element | v2 field | Read from | TUI cap |
| --- | --- | --- | --- |
| Lane title (resolved) | `lanes[].heading: Text` (cursor title, else lane title, else pane id); v1 `title` unchanged | `present.ts:92` (`cursor?.title ?? lane.title ?? lane.pane`) | none |
| Status badge | `lanes[].status` (v1), plus tab `status` (v1) | `badge(laneStatus(status))` `present.ts:43`; `laneStatus` `src/recap/domain/status.ts` | none |
| `<agent> <pane>` | `agent`, `pane` (v1) | `present.ts:95` | none |
| "from screen" flag | `lanes[].fromScreen: Flag` | `isScreenSource(cursor.transcript)` `present.ts:95`, `src/ports/screens.ts:4`; cursor = `recap.lanes.find(c => c.pane === lane.pane)` `present.ts:91` | none |
| Last prompt | `lastPrompt` (v1), now with the TUI fallback `lane.lastPrompt ?? cursor.lastPrompt`, newlines kept; mod joins with a space and clamps to 2 lines | `promptLines` `present.ts:71-74` | **2 wrapped lines** (`PROMPT_LINES` `present.ts:37`); v2 byte cap per prompt (section 4) |
| Compaction hint (`compact? 45% of 1M`) | `lanes[].compaction.hint: {percent: Count, window: Count} \| null` (null when the lane shows a stage) | `hintFor(lane.context, loadConfig().compaction.hint)` `compaction.ts:101`; threshold `config.ts:59,199` (`hintOf` `compaction.ts:32`: 10-95, default 40, `off` = null); suppressed when a stage is shown `present.ts:82,95`; window text `sizeOf` | threshold in `[10, 95]`, `off` disables |
| Context numbers | `lanes[].context: {tokens: Count, window: Count, share: Count, source: 'agent' \| 'catalogue' \| 'table' \| 'observed' \| 'setting'} \| null`; v1 `contextPercent` kept | `TabLane.context` `src/ports/tab-views.ts:21`, `ContextUse` `compaction.ts:52`, `shareOf` `:90` (unclamped, v1 clamps at 100) | `window <= 0` gives null |
| Compaction stage line | `lanes[].compaction.stage: GuiStage \| null`; `GuiStage = {id, stage: 'briefing' \| 'compacting' \| 'restoring' \| 'compacted' \| 'failed' \| 'unconfirmed' \| 'skipped', queued: Flag, writer: Text \| null, brief: 'written' \| 'template' \| null, why: Text \| null, startedAt: Instant, stageAt: Instant, tokensBefore: Count \| null, tokensAfter: Count \| null, tookMs: Count \| null, origin: 'operator' \| 'auto' \| 'request', text: Text}` | `store.compactions.shownFor(tab)` `column/main.ts:91`; `CompactionRecord` `src/ports/compaction-records.ts:8-27`; the record for the lane is `compactions.find(c => c.pane === lane.pane)` `present.ts:85`; `text` = `stageLine(record, now, {messages, style: plain})` `compaction-stage.ts:30` (`plain` from `wrap.ts`, used at `column/main.ts:15`), which embeds an `m:ss` clock from `stageAt`, so `text` is stale between publishes: the mod redraws the clock from `stageAt` | first record per pane |
| Tab-level newest stage (headline source) | not needed (bar is skipped, roadmap section 5) | `headline` `present.ts:229` | n/a |
| Notes: pane alerts | `lanes[].notes: GuiNote[]`, `GuiNote = {mark: Text, label: Text, at: Instant \| null, details: Text[], kind: 'alert' \| 'git' \| 'token' \| 'extension'}` | `notesOf(extensions, lanes, locale)` `src/extensions/load.ts:11`; `Note` `src/ports/extension.ts:6`, `DEFAULT_MARK` `:17`; drawn `present.ts:62-69` (`mark ?? ⚑`, label, "ago", details joined with ` · `); alert notes `stored-notes.ts:51`, token notes `:60` | none |
| Notes: git counts | `lanes[].git: {branch: Text, ahead: Count \| null, changed: Count} \| null` in addition to the git `GuiNote` | `statuses.statusOf(pane)` `stored-notes.ts:55`, `WorktreeStatus` `src/recap/domain/worktree.ts:20`, `changedOf` `:71` (tracked + untracked); shown only when `worktreeSwitch() === 'on'` `src/daemon/worktree-switch.ts` (`stored-notes.ts:40`) | git note hidden when the setting is off |
| Notes: token notes | `GuiNote` of kind `token` (`label`, `details: [value]`, `at: null`) | `stored-notes.ts:60-62` | none |
| Web context for links | `lanes[].web: {base: Text, forge: 'gitlab' \| 'github', branch: Text \| null} \| null` (v1 only has `branch`) | `LaneWeb` `tab-views.ts:7` | none |
| cwd | `cwd` (v1) | n/a | none |

### 1.4 Per tab (column meta line, warnings, footer)

| TUI element | v2 field | Read from | TUI cap |
| --- | --- | --- | --- |
| Recap freshness | `recapAt` (v1) | `recap.at` | none |
| Backend | `backend: Text \| null` | `recap.backend` `recap-records.ts:25`, drawn `present.ts:116` | none |
| Updating | `writing` (v1) | `recap.running` `present.ts:117` | none |
| Plugin version | `versions.plugin: Text \| null` | `codeVersion()` `src/adapters/plugin-version.ts:23` (reads `herdr-plugin.toml` from disk, so it reflects an upgrade after the daemon started); TUI `settled.version` `column/main.ts:41,66` | re-read per publish; the TUI re-reads every 3 s (`LOCALE_MS` `column/main.ts:25`) |
| Daemon version | `versions.daemon: Text \| null` | `TabView.daemonVersion` `tab-views.ts:30`, set by `TabViewsRepository` from `StoreOptions.daemonVersion` `database.ts:76,85` | none |
| Stale daemon notice | `versions.stale: Flag` | `staleLines` `present.ts:102-107`: `plugin !== null && daemon !== plugin`; text `messages.daemonStale(daemon)`; the restart button is phase 2 | none |
| Warnings | `warnings: Text[]` | `warningsOf(extensions, locale)` `load.ts:25` (red lines, `present.ts:153`) | none |
| Database-newer warning | not carried (section 6) | `column/main.ts:90` | n/a |
| Locale of carried strings | `locale: 'en' \| 'es'` | `loadConfig().locale` `column/main.ts:41` | none |
| Zone | `zone: Text` (IANA) | `Intl.DateTimeFormat().resolvedOptions().timeZone`, as `expanded-modal.ts:9` | none |
| Closed lanes | not drawn by the TUI column or modal (section 6) | closed lanes are only a text listing for handoff: `serializeClosedListing` `src/recap/render/closed-listing.ts:10`, called in `bin/handoff.ts:58`; reader `ClosureReader.listOf(tab, now)` `src/ports/closed-lanes.ts:33`, record `:16` | n/a |
| Bar headline | skipped (roadmap section 5 open question) | `presentBar`/`headline` `present.ts:229,250` | n/a |

## 2. How the `ExpandedModel` instance is obtained, by new code only

**What the model is.** `ExpandedModel` (`expanded-view.ts:35`) holds `deps` and a private `asked: Map<tab+task, {change, at}>`
(`:37`). `read()` has two side effects: (a) it calls `requests.requestCurate(tab)` when a task has stale story and a new change since
the last ask (`:61-63`), and (b) it advances `asked`, which also drives the `curating` flag (`:51-55`). The `edits` dep is
synchronous and backed by `EditCache`, which refreshes in the background at most every 60 s (`edit-counts.ts:49,57,62`), so the first
read after construction returns `[]` files.

**Decision: one daemon-owned instance, created once in the desktop frontend, never per publish and never in `show --json`.**

- New file `src/adapters/gui-model.ts` builds it from the **wrapped store** that `desktopFrontend().wrap(store, log)` already receives
  (`desktop-frontend.ts:38`; `Store` fields `database.ts:47-73` contain every dep: `records`, `ledger`, `stories`, `session`,
  `autocompact`, `boundaries`, `requests`). Construction is the literal of `expanded-modal.ts:12`:
  `new ExpandedModel({records, ledger, stories, session, autocompact, boundaries, requests, edits})` with
  `edits = (lanes, now) => cache.of(lanes, now)` and `cache = new EditCache(new EditCounts(modalTranscriptRegistry()))`.
  `modalTranscriptRegistry()` (`transcript-registry.ts:54`) has no screen reader, exactly like the TUI modal, so the files row matches
  the TUI. (`daemonTranscriptRegistry(screens, wants)` `:49` would also count screen-read lanes; it is not used, to keep parity.)
- `GuiPublisher` gets one new dep, `expanded: (tab, view, now) => ExpandedData`, and `document()` passes the result to the v2
  builder. `GuiPublisherDeps` is branch-created, so it is editable.
- **Bounded rate.** `publish()` is called on every `writeTab` and recap run (`publishing-views.ts:25`, `publishing-records.ts:23-33`),
  which is event-driven and can be frequent. The model read touches the ledger, stories, session and boundaries repositories (SQLite)
  and may call `requestCurate`. Policy: the gui-model wrapper keeps `{data: ExpandedData, at: Instant}` per tab and calls
  `model.read` at most once per `EXPANDED_EVERY_MS` (proposed 5 000 ms) per tab; in between it reuses the last data with the
  fresh lanes/status. A publish that finds the cache stale and arrives after a quiet period reads immediately. A trailing publish at the
  end of the interval makes sure the last change is shown (one `setTimeout` per tab, cleared on a new publish). The constant lives in
  the central constants/env module, not inline.
- **Side-effect gate for curation (decision needed, see unresolved).** In the TUI only a user opening the expanded modal calls
  `requestCurate` (grep: its only caller is `expanded-view.ts`), so curation work (model tokens) is user-initiated. A daemon-owned
  model would request it on every stale change with nobody looking. Proposed default: inject `requests` as a wrapper
  `{requestCurate: (tab) => wanted(tab) ? store.requests.requestCurate(tab) : undefined}` where `wanted(tab)` is true only when the
  overlay has the tab open (the mod touches `<state>/gui/open.<tab>` or the daemon sees the focused tab). The `curating` flag is then
  only meaningful when `wanted`; when gated off, the builder sets `curating` from the previous published value, never from a
  suppressed ask (otherwise "updating…" would show with no curation running).
- **`show --json` (CLI process).** It must not construct an `ExpandedModel` with a real `requests` (a read command must not queue
  work) and the CLI has no warmed `EditCache`. Policy: `show --json` first returns the daemon's published `<state>/gui/<tab>.json`
  when it exists and parses as version 2; otherwise it builds with `requests = {requestCurate: () => undefined}` and
  `edits = () => []`, and `curating` is `no`; the document says nothing about files, as the TUI's first modal frame does. `bin/desktop-document.ts`
  is branch-created and editable.

**Exported and reusable (verified by reading):**

| Symbol | File:line | Reuse |
| --- | --- | --- |
| `ExpandedModel`, `ExpandedDeps`, `ExpandedData`, `newestChange`, `CURATING_MS` | `expanded-view.ts:35,17,28,30,14` | used as-is |
| `EditCache`, `EditCounts`, `FileCount`, `countEdits` | `edit-counts.ts:43,21,8,13` | used as-is |
| `modalTranscriptRegistry` | `transcript-registry.ts:54` | used as-is |
| `timelineOf`, `dateLines`, `clockOf`, `dayOf`, `Entry` | `timeline.ts:28,35,16,18,20` | used as-is |
| `breakText`, `chaptersFact` | `timeline-breaks.ts:13,35` | `breakText` used for `GuiBreak.text` |
| `sessionLines`, `spanOf` | `session-lines.ts:42,8` | not needed for data; used by the parity test |
| `stageLine`, `figuresOf`, `clockOf` | `compaction-stage.ts:30,11,6` | `stageLine` with `plain` style for `GuiStage.text` |
| `groupsOf`, `Group` | `groups.ts:9` | used as-is |
| `linkify`, `Segment`, `isSafeUrl` | `links.ts:106,3`, `hyperlink.ts:10` | spans for text with refs |
| `hintFor`, `shareOf`, `sizeOf`, `tokensOf`, `hintOf` | `compaction.ts:101,90,92,94,32` | used as-is |
| `notesOf`, `warningsOf`, `loadExtensions` | `load.ts:11,25,7` | used as-is |
| `storedNotes`, `gitNoteOf`, `STORED_NOTES_ID` | `stored-notes.ts:65,22,12` | used as-is |
| `worktreeSwitch` | `src/daemon/worktree-switch.ts` | used as-is |
| `codeVersion` | `plugin-version.ts:23` | used as-is |
| `renderRecap` | `recap-shape.ts` (imported at `present.ts:13`) | for the markdown the TUI draws |
| `regionsOf`, `session`, `Draw`, `TaskData`, `expanded` | `expanded-regions.ts:121,116,15,25`, `expanded.ts:55` | only for the parity test (they return styled lines, not data) |

**Not exported / not reusable, so re-assembled in new files:**

- `expandedScreen` is the only export of `expanded-modal.ts:10`, and it returns a `(ColumnView, width) => string[]` closure that
  owns its own `EditCache` and `ExpandedModel` and formats lines. Nothing in it is a data seam. Its body is re-assembled
  in `gui-model.ts` as above (construction literal `expanded-modal.ts:11-12`, the `model.read(view.tab.tab, view.tab, view.now)` call
  `:20`).
- The region selectors `open` (`expanded-regions.ts:42`), `newest` (`:43`), `inDecisions` (`:67`), the needs sort (`:59`), the goal
  `slice(0,1)` (`:123`), `stamp` (`:49`), the links display rule (`:101`) and the `NOT_RECORDED` sentinel (`:65`) are module-private.
  `expanded-regions.ts` exists on the base and cannot be edited, so the selectors are re-implemented in a new
  `src/recap/application/gui-tab-regions.ts` using `isOpen` (`fact.ts`, exported) and the exported `timelineOf`; the parity test in
  section 7 keeps the copy honest.
- `markdownOf` (`present.ts:123`), `badge`, the lane header and `leads`/`headline` are module-private or string-producing; only
  `markdownOf` is re-implemented (it is one line over exported `renderRecap`).
- The column's `ColumnView` assembly (`column/main.ts:87-92`) is inside a script with top-level side effects (opens the store, enters
  the alternate screen), so it cannot be imported. It is re-assembled in `src/adapters/gui-model.ts`:
  `extensions = [...loadExtensions(configGetter()), storedNotes({statuses: store.worktrees, notes: store.paneNotes, alerts: store.paneAlerts, gitNote: worktreeSwitch})]`
  (the same list as `column/main.ts:44`; the daemon's own `extensions` at `src/daemon/main.ts:164` carries `{alerts}` only and has no
  `storedNotes`, and the frontend `wrap` cannot see it), `compactions = store.compactions.shownFor(tab)`, `compactHint = loadConfig().compaction.hint`,
  `locale = loadConfig().locale`, `messages = messagesFor(locale)`, `zone`.

## 3. Resulting `GuiTab` v2 (shape summary)

```
GuiTab (v2) = v1 fields unchanged, plus
  locale, zone, backend, versions {plugin, daemon, stale}, warnings[], claudeRecaps[],
  groups[], breaks[], session, cuts[],
  lanes[]  += heading, fromScreen, context, compaction {hint, stage}, notes[], git, web
  tasks[]  += facts[], regions {goal,now,needs,decisions,next,rules,links}, timeline[], story, curating, needsWaitedMs[]
              (sections gains rules; markdown becomes the drawn markdown)
```

`GuiSections.rules` is added as an optional-on-read field (`parse` defaults it to `[]`), because v1 files lack it.

## 4. The 1 MiB cap policy

Today `encodeGuiTab` (`src/recap/domain/gui-tab.ts:82`) returns `too-large` and the publisher logs and writes nothing, so the old
file stays on disk and the overlay silently shows stale data. v2 replaces that with a fit step before encoding.

**`fitGuiTab(tab, limit): GuiTab`** (new pure function, new domain file `gui-fit.ts`, no ports) shrinks stepwise until
`Buffer.byteLength(JSON.stringify(doc)) <= GUI_TAB_LIMIT` and records every cut in `cuts: GuiCut[]`:

`GuiCut = {part: 'timeline' | 'markdown' | 'text' | 'decisions' | 'prompt' | 'facts', task: NonEmptyText | null, kept: Count, total: Count}`

Order (first step first; each step is applied only if the document is still too large, and always to the least valuable data first):

1. `lanes[].lastPrompt` clipped to `PROMPT_BYTES` (2 KiB, constant) with an ellipsis. The TUI shows 2 lines; this is always applied
   (not only on overflow) and recorded as `prompt` only when something was cut.
2. **Timeline rows, oldest first**, per task, down to `TIMELINE_FLOOR_FIRST = 200` rows. Break rows are tiny and cut last (a break
   is cut only after the facts that rows reference are gone). Facts referenced only by dropped rows leave `facts[]`.
3. `tasks[].markdown` (the largest redundant text; recoverable from `sections` and `facts`) replaced by an empty text; cut recorded as
   `{part: 'markdown', kept: 0, total: 1}`.
4. Timeline rows again, down to `TIMELINE_FLOOR_SECOND = 40`.
5. `GuiFact.text` and `GuiFact.why` longer than `FACT_TEXT_BYTES` (4 KiB) clipped, with an ellipsis; recorded as `text`.
6. Closed decisions, oldest `firstAt` first, down to `DECISIONS_FLOOR = 50` (open decisions are never cut).
7. Last resort: write a minimal document (v1 fields, `lanes`, `status`, `session`, `warnings`) with `error` set to the "document too large"
   message and `cuts` listing every region emptied (`{part: 'facts', kept: 0, total: n}`), so the mod shows a notice instead of stale data.

Never cut at any step: open facts in goal, now, needs, next, rules and links; `lanes`; `status`; `session`; `versions`; `warnings`;
`cuts` itself. The mod shows one muted row per entry of `cuts` ("N older entries not shown") in the region it concerns. The
publisher logs one line per publish that has cuts (existing `log` dep). The size is measured on the exact string that is written
(`encodeGuiTab`), so there is no estimate to drift.

The roadmap sentence "cap the timeline, never drop a section silently" is covered by steps 2 and 4 and by `cuts`; sections are
never emptied except in step 7, which also says so in `error` and `cuts`.

## 5. Version 1 compatibility

- `GUI_TAB_VERSION` becomes `2`. The writer always writes v2; there is no dual write. A v1 file left on disk by an older daemon is
  replaced on the next publish for that tab.
- Every v1 key stays with the same name and type: `version, tab, name, status, at, recapAt, writing, error, lanes[].{pane, agent,
  status, title, cwd, lastPrompt, branch, contextPercent, since}, tasks[].{id, name, sections{goal, now, needs, done, decisions,
  next, links}, markdown}`. New keys are additive. Two semantic widenings, both harmless to a v1 reader: `lanes[].lastPrompt` falls
  back to the recap cursor's prompt, and `tasks[].markdown` becomes the markdown the TUI draws (equal to v1 when `sections` is null).
  `contextPercent` stays clamped at 100.
- `schema/gui-tab.schema.json` currently has `"version": {"const": 1}` and `additionalProperties: false`; it is branch-created, so it is
  edited to `{"enum": [1, 2]}` with v2 keys optional under v1 and required under v2 (`if/then`).
- `src/recap/domain/gui-tab-v2.ts` exports `parseGuiTab(input: unknown): Result<GuiTabAny, ParseFailure>` (named `parse<Domain>`, with
  `GuiTabAny` declared in the same file) that accepts version 1 and 2, uses `orElse` defaults for every v2 field when reading a v1
  file, and rejects any other version with a named `ParseFailure`. `parseGuiIndex` / index rows are unchanged (the index stays at
  `version: 1`, `gui-publisher.ts:56`).
- **The mod must read both.** `gui/main.js` currently has no version check (it reads `task.sections.*` and `lane.*` directly,
  `gui/main.js:113-114`). Phase 2 adds: `version === 1` draws the v1 layout (seven sections from `sections`, no timeline, session or
  stage); `version === 2` draws the Recap and Full views; any other value shows "this mod is older than the daemon" and nothing else.
  The mod never writes the file.
- An old mod (v1 reader) opening a v2 file keeps working, because it reads only v1 keys.

## 6. Elements with no source found, or only a partial one

1. **Closed lanes are not a TUI element.** Neither the column (`present.ts`) nor the modal (`expanded.ts`) draws them. The only consumer
   is the handoff listing (`bin/handoff.ts:58`, `closed-listing.ts:10`, `ClosureReader.listOf` `closed-lanes.ts:35`). The roadmap row
   "closed lanes" has nothing to port. If the lead wants them in the overlay, it is a new feature (reader exists; default
   `TAB_RECAP_CLOSED_LANE_DAYS` 14), not parity. Not part of v2 unless asked.
2. **Files-edited total.** `SessionFacts.files` is sliced to 5 inside `sessionFactsOf` (`session-facts.ts` `input.edits.slice(0, FILES_SHOWN)`),
   and `ExpandedData` exposes nothing else. The TUI cannot show the total either; v2 matches the TUI (5, no total).
3. **Database-newer warning** (`column/main.ts:90`, `messages.database.newer`) cannot occur in a document written by the daemon (the
   daemon holds the store open; it refuses a newer database at start). `show --json` already prints it as an error
   (`bin/desktop-document.ts:59`). No v2 field.
4. **Bar headline** (`presentBar`/`headline`, `present.ts:229`): `headline` is not exported and the roadmap leaves the bar undecided.
   Skipped.
5. **Footer key hints and the "waiting for agent / no recap yet" strings**: static messages (`messages.hints`, `waitingForAgent`,
   `noRecapYet`), not data. The mod owns them; the locale tables are phase 6.
6. **Stage clock** (`m:ss`, `compaction-stage.ts:6`) and **"waiting N" / "ago"** are time-of-draw values. v2 carries the anchor
   instants; the pre-rendered `GuiStage.text` is correct only at publish time.
7. **Per-lane `ExpandedModel` lane title** uses `lane.title` clipped to 20 characters (`expanded-view.ts:67`), while the column uses the
   cursor title first (`present.ts:92`); both are carried (`session.agents[].label`, `lanes[].heading`).
8. **Not read, so unverified**: `linkify`'s internal rules (`links.ts` beyond its exports), `messages.*` tables, `laneStatus`
   mapping, `RequestsRepository.requestCurate` idempotency (`src/adapters/db/requests.ts:120`), how often `writeTab` fires in the
   running daemon, and whether `StoredNotes` needs a store handle the wrapped store does not expose (it takes only the three readers
   plus `worktreeSwitch`, `stored-notes.ts:15-20`, all present on `Store`).

## 7. Tests that bind the design

- **Parity** (the roadmap's "a test compares the two for one fixture"): build a fixture store, call `ExpandedModel.read` and the v2
  builder over the same data, render `expanded(...)` with the `plain` style, strip nothing, and assert that (a) every `FactId` listed in
  `regions.*` and `timeline` has its text in the rendered lines of the matching heading, (b) the id order equals the order of the
  rendered bullets, (c) the day separators equal `dateLines`, (d) `session` rows equal `sessionLines` text when formatted.
- **Cap**: a fixture with 5 000 timeline facts encodes under 1 MiB, `cuts` has a `timeline` entry whose `kept + dropped = total`, open
  facts are all present, and no region is empty without a `cuts` entry.
- **v1 file**: `parseGuiTab` of a recorded v1 file yields defaults for every v2 field; a version 3 file is rejected by name.
- **No side effect**: `show --json` with a stale story queues no curation request (spy on `requests`).
- **Rate**: 50 `publish` calls within 1 s cause at most one `model.read` per `EXPANDED_EVERY_MS`, and the last publish is delivered.
- Domain-type ratchet registry (`ci/domain-types-baseline/B6.json`) and `ci/lanes.json` are regenerated, not hand-edited.
