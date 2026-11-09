# Port spec: the locked mockup becomes the tab-recap desktop mod

Written 2026-11-08. Design only: no mod or engine code is written by this document. Paths are relative to `tab-recap/` unless they start
with `openspec/` or `~`. `file:line` was read on branch `research/gui-port`. Quotes from the herdr-app guide are from
`~/.config/herdr-app/AGENTS.md` (`AGENTS.md:n`), `herdr.d.ts` and `gpui-kit.d.ts`.

The view is locked (`ux-plan.md` 8b, `ux-mockup/README.md` "Status: locked"). The real mod matches the mockup's layout, colour roles,
status shapes, lane chips with the compaction tick, anchored compact popover with the inline stepper, binned timeline with axis and day
separators, keys (`j k / Enter 1-4 c r Esc`) and both themes. Every place where the real API or the real data forces a difference is
listed in section D.13 (API) and A.8 (data). Nothing outside those two lists may differ.

What the renders show (read, `ux-mockup/shots/v2/`): `fleet-dark` (header with count line, status filter toggles with counts, search,
grouped rows with a 3 px accent bar on the selected one, key footer), `brief-blocked-light` (back button, crumb, segmented Brief/Story/
Timeline/Session, `1 of 5`, title with pill, goal, recap age, Refresh, two lane chips, since banner, two columns), `compact-open`
(popover under the lane chip: heading, hint line with bolt, textarea, `0 / 280`, Cancel, Compact), `compact-running` (the lane chip
holds the 2x2 stepper, `Compacting` pill replaces the compact button), `timeline-dark` (filter toggles with swatches and counts,
search, plot with dashed break markers, bars coloured by dominant section, `now` pill, feed with a day header), `ambient-dark`
(strip in each pane header, chip in the status bar).

## 0. Decisions this spec takes (the lead may overrule)

1. One mod `tab-recap`, one `main.js` router, roles `chip`, `strip`, `fleet`, `brief`, plus `compact` (the popover overlay, D.6).
   No role `ambient` (that is the mockup's fake app frame) and no old overlay: `gui/main.js` (598 lines) is replaced.
2. Fleet and Brief are one persistent window (`key: "tab-recap"`), as in the mockup where `#window` swaps scene. The role in `props()`
   only says which scene it opens in; Back, Enter and Esc switch scene inside the same view without reopening (D.2).
3. Status shown in the app is **live** (`spaces()`, `agents()`), the index status is the fallback (A.2, B.4).
4. "Since you last looked" is stored in `shared("tab-recap.seen")`, not in `localStorage`, and the banner is computed from the value
   held when the tab was opened (A.6, D.9).
5. The compaction-hint threshold, which the mockup draws as a tick, is not in any document today: it becomes an additive field (B.3).

---

## A. Field map: what each view reads, and where it really comes from

Legend: **doc** = `tab-recap/gui/<encodeURIComponent(tab)>.json` (GuiTab v2, `schema/gui-tab.v2.schema.json`, types
`src/recap/domain/gui-tab-types.ts`, `gui-tab-parts.ts`); **idx** = `index.json` row (`GuiIndexRow`, today `tab name status at`,
`src/recap/domain/gui-tab.ts:17-22`; extended in B); **live** = `spaces() agents() panes() focused() theme()`; **mod** = computed in the
mod. **NONE** = no real source (collected in A.8).

### A.1 Tab level (fixtures `tabs[]`)

| Mockup field | Used by | Real source |
| --- | --- | --- |
| `id` | all | idx `tab` / doc `tab` (`TabId`). File name `encodeURIComponent(tab)+".json"` (`guiFileName`, gui-tab.ts:56). Live ids of other machines carry `<machine>/`: such tabs have no document (the daemon is local), Fleet shows them from live data only. |
| `space` | fleet row, crumb | **mod**: `spaces().find(s => s.tabs.some(t => t.id === tab)).name` (`SpaceInfo.name`, herdr.d.ts:114). The daemon only knows workspace ids (`hc-fleet.ts:242`), so it is not in doc or idx and stays out of B. |
| `name` | row, title, crumb, tab list | doc `name` (idx `name`): first task name, else the tab id (`nameOf`, gui-tab-build.ts). If the doc is absent: live `TabInfo.name`. |
| `st` (blocked/done/working/idle) | shape, pill, group, chip | **live** `TabInfo.status` (`herdr.d.ts:96`, most urgent agent, blocked > done > working > idle, "done" = finished while unseen). Fallback idx `status`. See A.8 item 4: the index order differs. |
| `recapAgo` | "recap 3 min ago", row age | **mod**: `now - idx.recapAt` (B.2); doc `recapAt` (`GuiTab.recapAt`). Null: "no recap yet". For Fleet rows with no recap use idx `at`. |
| `goal` | brief title | doc `tasks[i].sections.goal` (first task with a non-empty goal). v2 `regions.goal` ids give the same fact. |
| `hl` | row, strip | idx `headline` (B.2). Rule in B.2. |
| `waitMin` | row "waiting 14 min", brief card header | **mod**: `now - idx.waitingSince` in minutes (B.2). Doc has `needsWaitedMs[]` (publish-time, goes stale); do not use it. |
| `need.q` | brief need card | doc `tasks[i].facts[]` where id in `regions.needs` (open, oldest first): `text`; v1 or no facts: `sections.needs[]`. |
| `need.options[]` | brief need card | **NONE** (A.8 item 1). `fact.why` (nullable) is shown as the muted paragraph in its place. |
| `lanes[]` | lane chips, fleet dots | doc `lanes[]` (A.2). Fleet and strip read idx `lanes[]` (B.2). |
| `now[]` | brief | doc `regions.now` -> `facts[].text` (newest first); v1: `sections.now`. |
| `next[]` | brief | doc `regions.next` -> facts; v1: `sections.next`. |
| `decs[] {ago,title,why}` | brief, hover | doc `regions.decisions` -> `facts[]`: `title`=`text`, `why`=`why` (null: no row body), `ago`=`now-firstAt`. `closedWhy` (non-null) is shown as the muted line `closed: <why>` inside the body (TUI parity; A.8 item 9). |
| `links[]` | link chips | doc `regions.links` -> `facts[]`: label = `ref` else `text`, url = `spans[0].url` (null: chip is inert text, no link icon click). |
| `facts[] {ago,kind}` | since banner | doc `tasks[].facts[]` (`firstAt`, `section`, `state`) and `breaks[]` (`at`, `kind`). Mapping in A.6. |

Multi-task tabs (the mockup has one task per tab): Brief aggregates, it does not add a task switcher. Sections are concatenated in task
order; when `tasks.length > 1` each need card, decision row and list item gets a muted task-name prefix. Goal is the first non-empty goal.

### A.2 Lane (`lanes[]`, `laneChip`, `session` table)

| Mockup field | Real source |
| --- | --- |
| `agent` | doc `lanes[].agent` (`AgentKind`). |
| `name` | doc `lanes[].heading` (cursor title, else lane title, else pane id: `headingOf`, gui-tab-lanes.ts). |
| `st` | doc `lanes[].status` (`working blocked idle done unknown`, `laneStatus`, `src/recap/domain/status.ts`). `unknown` is the dashed ring. For the lane of a live agent prefer `agents().find(a => a.address === lane.pane).status` (old mod, main.js:341). |
| `ctx` | doc `lanes[].contextPercent` (`percentOf`, rounded `tokens/window`, null without a window). Null: the meter is drawn empty with `--`. Doc `lanes[].context.share` is the same number via `shareOf`. |
| `ctx >= C.HINT` (hint state) | doc `lanes[].compaction.hint !== null` (set when use reaches the configured threshold, `hintFor`, compaction.ts:101-106). |
| `C.HINT` (tick position) | **NONE today**: `GuiHint.percent` is the current share, not the threshold. Additive `compactHint` (B.3). Mod default `HINT_DEFAULT=40` (README:308; the mockup's 75 is invented). |
| `C.CTX_WINDOW` ("200k") | doc `lanes[].context.window` formatted by the mod (`sizeOf`-like: `>=1e6` -> `1.5M`, else `Nk`). Null context: window text omitted. |
| `lane.pane` identity | doc `lanes[].pane` is the **terminal address**, matched in the old mod with `agents().address` (main.js:341). A pane header gets `props().terminal` and `PaneInfo.terminal`. Never match against `PaneInfo.pane`. Unverified for real agents (the smoke state has no lanes): U0 spike item. |
| compaction stepper `S.run`, `STEPS`, `STEP_SECS` | doc `lanes[].compaction.stage` (`GuiStage`): `stage` in `briefing, compacting, restoring, compacted, failed, unconfirmed, skipped`, `queued`, `startedAt`, `stageAt`, `tokensBefore/After`, `tookMs`, `text`. Step index = position of `stage` in `[briefing, compacting, restoring, compacted]`; steps before it are done (green check). Seconds: **only the current step** (`now - stageAt`) and, when `compacted`, total `tookMs`. Per-step durations of finished steps: **NONE** (A.8 item 5). |
| `Compacting` pill | stage in `briefing, compacting, restoring`. |
| toast "Compacted, 78% to 21% · 43 s" | `stage.stage === "compacted"`: `tokensBefore/window`, `tokensAfter/window` as percent, `tookMs`. Fired by the mod on observing the transition (D.12). |

### A.3 Brief header and banner

| Mockup | Real |
| --- | --- |
| pill label (`STATUS_PILL`) | mod constant, key = tab status. |
| `Refresh` / `Refreshing` | mod state: exec in flight, or idx `writing === "writing"` for this tab, capped by `REFRESH_MAX_MS`. Command `refresh <tab>` (commands.js, `bin/tab-recap-desktop.ts:44`). |
| "N of 5" | mod: position of the tab in the unfiltered urgency list (as the mockup, `window.js`). |
| Since banner | A.6. |

### A.4 Story, Session, Timeline

| Mockup | Real |
| --- | --- |
| `story.text` | doc `tasks[i].story.text` (+`spans` for links, rendered with `TextView.markdown` built from spans). Null story: "No story yet"; `curating === "yes"`: "Writing the story". |
| `story.chapters[] {title,date,text}` | **NONE** (A.8 item 2). Only `session.chapters` (count) exists. Nearest: one line `N chapters` under the story card; the list is not drawn. |
| session fact `3 d / session length` | doc `session.started.forMs` (format by mod). |
| `41 / turns: 9 prompted, 32 by agents` | doc `session.runs.total` and `byCause[]`. The causes are `turn-ended, focused, requested` (old mod `CAUSES`, main.js:8), not prompted vs agent: tile sub-label is the cause list. **NONE** for the split (A.8 item 6). |
| `2 / compactions, 3 chapters` | doc `session.compactions.count`, `session.chapters`. |
| `18 / files edited` | doc `session.files[]` is cut to 5 and has no total (document-v2.md section 6 item 2): tile shows the count of listed files with label `files edited (top 5)`. |
| `62% / context, claude` | doc `session.agents[]` `{label, share, window}` (one tile per agent), else lanes. |
| `feat/cart / 3 commits unpushed` | doc `session.repo.{name,branch}` and `lanes[].git.{ahead,changed}`. |
| lanes table (`ctx`, `of 200k`) | doc `lanes[]` as A.2. |
| timeline `events[] {t,sec,text}` | doc `tasks[].facts[]`: `t=firstAt`, `text`, `sec` mapped `needs->needs, decisions->decisions, done->done, now->progress`; sections `goal next links rules` are not events. **Not** `tasks[].timeline`: that holds only done and closed facts (`timelineOf`, `src/recap/render/timeline.ts:28-33`) and would leave the Needs, Decisions and Progress filters empty. |
| `breaks[] {t,kind,text,short}` | doc `breaks[]` (`GuiBreak`): `kind` `compacted -> compaction` (text from doc, `tokensBefore -> tokensAfter`), `switched -> session` ("New session"). `chapter` kind: **NONE** (A.8 item 2): no chapter markers are drawn. |
| day / clock / weekday labels | mod: `Intl.DateTimeFormat` with `timeZone: doc.zone` (the old mod does the same, main.js `partsOf`). |
| `HOURS=48`, `BIN_COUNT=32`, 6 h axis | mod constants. Window = `[now-48h, now]`; older events stay in the list, are not plotted, and the summary line says `N older not plotted`. |
| cuts | doc `cuts[]` (`part`, `kept`, `total`): when non-empty a muted line says what was cut (parity principle 9 in `ux-plan.md`). |

### A.5 derive.js outputs

| Mockup `derive` | Real |
| --- | --- |
| `maxCtx(t)` | max of idx `lanes[].contextPercent`, or idx `contextPercent`. |
| `byUrgency(tabs)` | sort by `STATUS_ORDER = [blocked, done, working, idle]` then longest waiting first (`waitingSince` ascending), then name. Unknown/no status sorts last. |
| `ago(min)` | same strings (`just now`, `N min ago`, `N h ago`, `N d ago`). |
| `since(tab, seen)` | A.6. |
| `ms/clock/day/weekday` | `Intl` with `doc.zone`. |
| `matches/bins/feed` | same algorithm on the A.4 events; bin `dominant` section tie-break keeps the mockup order `needs, decisions, done, progress`. |

### A.6 "Since you last looked" (seen.js)

- Store: `shared("tab-recap.seen")` = `{version: 1, tabs: {<tab>: <epoch ms>}}` (D.9). Missing entry: `seen = now - FIRST_LOOK_MS` (24 h).
- `open(tab)` copies the stored value into memory (`opened[tab]`) and the banner is computed from that copy. The write
  (`tabs[tab] = now`) happens when the brief **leaves** the tab (Back, tab change, Esc, window `close()`), never on open (else the
  banner always reads "nothing new").
- Counts, from the doc: `need` = facts with `section needs`, `state open`, `firstAt > seen`; `dec` = `section decisions`, `firstAt > seen`;
  `fact` = `section now` or `done`, `firstAt > seen`; `comp` = `breaks[]` with `kind compacted`, `at > seen`. The mockup text is kept:
  `N need open`, `N new decision(s)`, `N progress update(s)`, `compacted Nx`, else `nothing new`, and `(<ago(seen)>)`.
- v1 doc (no facts): banner shows `nothing new`.

### A.7 Colour and token map (theme())

Mockup token -> `theme()` name (`herdr.d.ts:265-270`): `--bg`->`background`, `--chrome`->`chrome`, `--surface`->`surface`, `--raised`->`raised`,
`--hover`->`hover`, `--selected`->`selected`, `--border`->`border`, `--fg`->`foreground`, `--muted`->`muted`, `--dim`->`dim`,
`--accent`->`accent`, `--on-accent`->`accent_foreground`, `--blocked/--working/--done/--idle` -> same names, unknown -> `unknown`,
`--violet` -> **no token**: use `ansi5` (magenta) and flag it (A.8 item 8), `--cut` -> not a colour: a hole in the icon (D.8).
Tints (`color-mix(... 16%, transparent)`) -> `theme()[name] + "29"` (hex alpha, the pattern in `~/.config/herdr-app/mods/pane/main.js:67`,
`t.blocked + "26"`). Only `roles/theme.js` may read `theme()` keys; views receive a token object (`tokens(t)`), so the test can swap
dark and light.

### A.8 Fields with no real source (and the nearest form)

| # | Mockup element | Why | Nearest form |
| --- | --- | --- | --- |
| 1 | `need.options[]` | a need is one text | text + `why` paragraph |
| 2 | story chapters (title, date, text) and `Ch 1..3` markers | doc has `session.chapters` count and breaks `compacted\|switched` only (`boundary.ts:3`) | count line; markers only for compaction and new session. Needs an engine feature (chapter titles) if the maintainer wants them |
| 3 | meter tick (`C.HINT`) | threshold not in doc | B.3 |
| 4 | tab status order | `worstStatus` ranks working before done (`gui-tab.ts:28 URGENCY`), the app and mockup rank done before working, and a snapshot never flips done back to idle | live status, index fallback, no engine change |
| 5 | per-step seconds of finished steps | only `startedAt`, `stageAt`, `tookMs` | current step seconds, total on done |
| 6 | "9 prompted, 32 by agents" | `runs.byCause` has other causes | cause list |
| 7 | files edited total | cut to 5 in the engine | `top 5` label |
| 8 | violet | no theme token | `ansi5` |
| 9 | decision `closedWhy` | not in the mockup | muted line inside the body only |
| 10 | space name | not in doc | live `spaces()` |
| 11 | "Done, unseen" per viewer | the app already resets done -> idle when anyone looks | live status |

---

## B. Additive extension of the index (and one document field)

Goal: Fleet (every tab) and the pane strip read `index.json` only and never open the per-tab documents; a document is read only for the
selected brief. All additions are additive: `version` of `index.json` stays `1`, every old reader keeps working.

### B.1 Placement (engine rules)

`GuiIndexRow`, `GuiIndex`, `parseGuiIndexRow`, `parseGuiIndex` are branch-created in `gui-tab.ts`; keep the exports and move the new
types to a **new** file `src/recap/domain/gui-index.ts` (re-exported from `gui-tab.ts`) and the derivation to
`src/recap/application/gui-index-build.ts`. `GuiPublisher.write` (`src/adapters/gui-publisher.ts:70-77`) keeps calling `guiIndexRow(document)`.
Registries: `ci/lanes.json` via `bun ci/lanes-generate.ts`, `ci/domain-types-baseline/B6.json`. Every exported signature uses branded
types (`Count`, `Instant`, `Text`, `NonEmptyText`, `PaneId`, `AgentKind`, `Flag`, `GuiStageId`); parsers take `unknown` and are named
`parseGui...`; no primitives, no `boolean` (use `Flag`), complexity <= 10, <= 25 statements, explicit return types, `toSorted`.
Banned identifier words: summary sidebar panel offset worker.

### B.2 Row fields

```
GuiIndexRow (existing)       tab TabId · name NonEmptyText · status NonEmptyText · at Instant
  + recapAt       Instant | null     = tab.recapAt
  + writing       GuiWriting         = tab.writing                     (default "resting")
  + headline      Text               rule below                        (default "")
  + needs         Count              open needs                        (default 0)
  + waitingSince  Instant | null     oldest open need                  (default null)
  + contextPercent Count | null      max over lanes                    (default null)
  + hintPercent   Count | null       = tab.compactHint (B.3)           (default null)
  + laneCount     Count              lanes.length before the cap       (default 0)
  + lanes         GuiIndexLane[]     first INDEX_LANES_MAX (8), urgency order
GuiIndexLane
  terminal        PaneId             = lane.pane (terminal address)
  agent           AgentKind          = lane.agent
  status          NonEmptyText       = lane.status
  name            Text               = lane.heading clipped to 80 characters
  contextPercent  Count | null       = lane.contextPercent
  hint            Flag               = lane.compaction.hint !== null
  stage           GuiStageId | null  = lane.compaction.stage?.stage
```

**Headline (exactly):**

1. Open needs, across tasks in task order. From facts when the document has them: `regions.needs` ids -> `facts[]` with `state open`;
   pick the one with the smallest `firstAt` (longest waiting). Without facts (v1 task, or a task with no facts) use `sections.needs[0]`
   of the first task that has one. Text = that fact's `text`.
2. Else the NOW line: `regions.now[0]` (newest open `now` fact) of the first task that has one, else `sections.now[0]`.
3. Else the title of the lane with the highest urgency (`blocked, done, working, idle, unknown`, ties in lane order): `lane.heading`.
4. Else `""` (the mod shows `No recap yet`).

The chosen text is trimmed, internal whitespace runs collapsed to one space, clipped to `HEADLINE_MAX=160` with a final `…` within
the limit. The mod colours it red when `needs > 0`.

**needs** = count of open need facts across tasks (v1: `sections.needs.length`).
**waitingSince** = smallest `firstAt` among open need facts; else, if any lane is `blocked`, the smallest `lane.since` of those; else null.
**contextPercent** = max of `lanes[].contextPercent` that are non-null; null when none.
**lanes** order = urgency of status, then document order; `laneCount` is the uncapped count (Fleet prints `N lanes` when `laneCount > 1`).

### B.3 Document: `compactHint`

`GuiTab` gains `compactHint: Count | null` = `reads.compactHint` (already read, `gui-tab-reads.ts:16`; set from
`config.compaction.hint`, desktop-expanded.ts:93). Add the optional property to `schema/gui-tab.v2.schema.json` (not in `required`) and
default it to `null` in the v2 parser, so documents already on disk still parse. The index row carries the same value as `hintPercent`.
Mod rule: `hint = idx.hintPercent ?? HINT_DEFAULT (40)`.

### B.4 Compatibility and the re-serialisation trap

- Old rows (`{tab,name,status,at}` only) must parse: every new field is read with `orElse(..., default)` exactly like `name` and
  `status` today (`parseGuiIndexRow`, gui-tab.ts:62-67); a malformed lane inside `lanes` is dropped, not the row.
- `GuiPublisher.write` re-reads the index (`rowsOn`), re-parses every other tab's row and writes them back (publisher.ts:76-77).
  **The parser must carry every new field**, otherwise publishing tab B silently strips tab A's headline. Test: publish A then B,
  assert A's row keeps all new fields; publish with an old-shape index on disk, assert defaults.
- `index.json` keeps rows of closed tabs. The mod drops a row whose tab id is not in live `spaces()` (and whose machine is local).
- `status` stays `worstStatus` (blocked, working, done, idle). Not changed: the mod ranks with live status (A.8 item 4).
- Size: a row is about 600 bytes with 8 lanes; 200 tabs stay well under `readTextFile`'s 1 MiB read limit (herdr.d.ts:23).
- Tests (engine side, `test/gui-index.test.ts`): headline rule order with fixtures for need, now, lane, none; needs/waitingSince for open
  and closed facts; `contextPercent` max with a null lane; lane cap and `laneCount`; old-row parse; the A-then-B carry test; `compactHint`
  round-trip through `encodeGuiTab` and the schema test (`test/gui-schema-support.ts`).

---

## C. Module map of `tab-recap/gui/`

All files ES modules, `import ... from "./x.js"`, default export only from `main.js`. No comments, no magic values: every number, key
name, command word, file name, interval, label and token lives once in `constants.js`. Zero runtime dependencies. Mod JS is **excluded
from oxlint** (`.oxlintrc.json:25 "gui/**"`) so the rules below are enforced by the harness (F.5) and review. Soft limit 200 lines and
complexity 10 per file, to keep it readable and porting-friendly.

| File | Exports | Ports from |
| --- | --- | --- |
| `mod.json` | `{ "place": "none", "title": "Tab Recap", "overlay": { "kind": "window", "width": 780, "height": 620 } }` (verify, D.2) | old `gui/mod.json` |
| `main.js` | `default class TabRecap extends View`: reads `props().role`, builds the role view, `init` and `render` delegate, `close` forwards. No UI. Default role when absent = `fleet` (a `mod.open` overlay has no props, D.2). Unknown role: one line `tab-recap: no role "<x>"` | `js/app.js` (router part), `~/.config/herdr-app/mods/win98/main.js:1-35` |
| `constants.js` | `ROLES`, `HINT_DEFAULT`, `CTX_WINDOW_FALLBACK`, `NOTE_MAX=280`, `BIN_COUNT=32`, `HOURS=48`, `AXIS_STEP_MIN=360`, `STATUS_ORDER`, `STATUS_GROUP`, `STATUS_PILL`, `SECTIONS`, `SECTION_LABEL`, `SECTION_TOKEN`, `BREAK_LABEL`, `BREAK_ICON`, `STEPS`, `VIEWS`, `KEYS` (key names and hint footer rows), `COMMANDS` (`ensure refresh start stop`), `ENV` (`TAB_RECAP_BIN`, `TAB_RECAP_STATE`), `PATHS` (`gui`, `index.json`, `open.`, icon prefix `mods/tab-recap/icons/`), intervals (`FOCUS_MS`, `POLL_MS`, `MARKER_MS`, `REFRESH_MAX_MS`, `STAGE_FRESH_MS`, `FIRST_LOOK_MS`), size constants, `SAFE_TAB`, `SEEN_KEY` | `js/constants.js`, old main.js top |
| `theme.js` | `tokens(t)` -> role token object (A.7), `tint(color, alpha)` | `css/tokens.css` |
| `commands.js` | `ensureDaemon()`, `refreshTab(tab)`, `refreshAll(tabs)`, `restartDaemon()`, `touchMarker(dir,tab)`, `clearMarker(dir,tab)`, `jumpToLane(tab, terminal)`, `openLink(url)`, `compactLane(tab, terminal, note)` (disabled, D.10), `replyToLane(...)` (disabled, D.10). Every `exec` is `exec(command, argvArray)`; tab ids pass `SAFE_TAB` first. Resolve the binary and state dir without a shell: `exec("printenv", ["TAB_RECAP_BIN"])` (exit 1 = unset -> `tab-recap-desktop` from PATH) | old main.js `desk`, `refresh`, `mark` |
| `store.js` | `createStore()`: `index()` rows (parsed, defaults applied, closed tabs dropped), `doc(tab)` (version check `SUPPORTED=[1,2]`, newer = "this mod is older than the daemon"), `watch(cx, onChange)` (`watchFolder(dir)` loop + `POLL_MS` fallback timer), `live()` (spaces/agents merge, A.2), `stateDir()` | old main.js `load/watch`, `js/data/fixtures.js` |
| `seen.js` | `openTab(tab)`, `leaveTab(tab, now)`, `lastSeen(tab, now)`; pure core `since(doc, seen)` | `derive.js since` |
| `derive.js` | `byUrgency`, `maxCtx`, `visible(rows, filter, q)`, `fleetGroups(rows)`, `headlineOf(row)`, `bins`, `matches`, `feed`, `eventsOf(doc)`, `breaksOf(doc)`, `needsOf(doc)`, `decisionsOf(doc)`, `stepsOf(stage, now)` | `js/data/derive.js` |
| `time.js` | `ago`, `clock`, `day`, `weekday`, `sizeOf`, `percentOf` (all `Intl`, zone as argument) | `derive.js ago/clock/day/weekday` |
| `keys.js` | `keymap` (data: key -> action id) and `dispatch(event, state)` returning an action; no side effects | `js/app.js` keydown |
| `icons/*.svg` | one file per icon of `ui/icons.js`: `blocked done working idle unknown chevron back refresh gear search clock history jump send link close bookmark compress play bolt` | `js/ui/icons.js` |
| `ui/icon.js` | `icon(name, size)` -> `svg(PATHS.icons + name + ".svg").size(size).flex_none()`; `spin` on `working` | `ui/icons.js` |
| `ui/status.js` | `status(st, size, t)`: icon + colour token per status; `aria` text via `accessibility_label` if present | `ui/status.js` |
| `ui/pill.js` | `pill(st, label, t)`, `pillCompacting(t)` | `ui/pill.js` |
| `ui/meter.js` | `meter(percent, width, hint, t)` (track, fill neutral or `working` at `>= hint`, tick at `hint`%) | `ui/meter.js` |
| `ui/button.js` | `btn(label, o)`, `kbd(k)`, `seg(items, active, onPick)`, `search(id, ph, state)` | `ui/button.js` |
| `ui/chip.js` | `chip(label, icon)`, `laneChip(lane, i, ctx)` incl. inline stepper | `ui/chip.js` |
| `ui/hover.js` | `hint(el, text)` (`.tooltip(text)`), `hoverCard(id, trigger, content)` | `ui/hover.js` |
| `ui/card.js` | `card(title, body, o)`, `cardHead(label, icon)` | `components.css .card` |
| `views/brief.js` | `brief(model, ctx)`: title row, lanes, banner, grid | `views/brief.js` |
| `views/story.js` | `story(model, ctx)` | `views/story.js` |
| `views/timeline.js` | `timeline(model, ctx)`: filters, plot, feed | `views/timeline.js` |
| `views/timeline-plot.js`, `views/timeline-feed.js` | plot with bins, markers, axis, `now`; feed with day headers | split of the above |
| `views/session.js` | `session(model, ctx)` | `views/session.js` |
| `roles/chip.js` | `Chip` | `roles/chip.js` |
| `roles/strip.js` | `Strip` | `roles/strip.js` |
| `roles/fleet.js` | `fleetView(state, ctx)`, rows, filters, header | `roles/fleet.js` |
| `roles/window.js` | `Window` role (hosts `fleet` and `brief` scenes, state of `js/app.js`: scene, sel, view, filter, q, lane, bin, tlSec, tq, refreshing), frame bar, key footer `hints()` | `roles/window.js`, `app.js` |
| `roles/compact.js` | `Compact`: popover body (heading, hint line, textarea with `0 / 280`, Cancel, Compact); used inline (Popover) or as a `popup` overlay role | `roles/popover.js` |
| `roles/notify.js` | `compactedToast(lane, stage)` -> `notify({...})` | `roles/popover.js toast` |

Interface between the two builders (D.15): `store.js` and `derive.js` produce plain objects, the UI only consumes them.
`TabRow = {id,name,space,status,headline,needs,waitingSince,recapAt,contextPercent,hintPercent,laneCount,lanes[],live:boolean}`;
`BriefModel = {row, goal, needCards[{text,why,since,task}], now[], decisions[{id,title,why,at,closedWhy,task}], next[], links[{label,url}],
lanes[] (doc lanes with stage), story, session, events[], breaks[], cuts[], tasks:int, banner{seen,need,dec,fact,comp}}`.

---

## D. herdr-app mechanics, verified

### D.1 One mod, several roles

- `~/.config/herdr-app/mods/win98/main.js:1-3` `"Herdr 98: the whole Windows 98 layout is this one mod, in roles. The layout and overlays give each copy props { role }"`; `:17-30` `const ROLES = {...}; ... const pr = props() ?? {}; const R = ROLES[pr.role]; this.role = R ? new R() : null; this.role?.init?.(pr, cx);`; `render` returns `this.role.render(cx)`.
- `mods/win98/mod.json` is `{ "place": "none" }`; the layout places roles through `content.props` (`layouts/win98.json`: `"mod": "win98", "props": {"role": "desktop"}`, header block `"role": "window"`, floating `"role": "clippy"`, status `"role": "taskbar"`); overlays pass `props: { role: k }` (`win98/taskbar.js:186`).
- `AGENTS.md:772-779` `"main.js the mod (required) ... *.js, *.svg more modules ("./ui.js")"` confirms multi-file with relative imports.
- Our `main.js` does the same: `ROLES = { chip, strip, fleet, brief, compact }`; `props().role` absent -> `fleet`.

### D.2 Fleet as a persistent floating window, and how it opens

- `herdr.d.ts:332-361` `OverlaySpec`: `kind?: "dialog" | "popup" | "window"`, `key?: string` ("A window's name: it remembers where it was dropped and opens there next time; opening the same key again replaces the open one, in its place"), `keep?: boolean` ("With `key`: the window also reopens on the next start ... Only the window comes back: a mod keeps its own state (`shared`)"), `width/height` ("px, or up to 1: a share of the window"), `at`, `frame?: "none"`. `AGENTS.md:956-970` (windows at :961) repeats it: `"Windows (kind: "window"): stay open until closed (no dimming...), a press the mod doesn't stop drags it ..., the one pressed last is on top. ... It doesn't take the keyboard when it opens (a mod may focus itself)."`
- Spec used: `openOverlay({ mod: "tab-recap", kind: "window", key: "tab-recap", keep: true, width: 780, height: 620, props: { role: "fleet" | "brief", tab } })`. Default frame (not `"none"`): Herdr draws border, corners, shadow, which is what `.win` draws in the mockup, so the mod draws none (`herdr.d.ts:349`).
- **Opened from**: (a) the chip click (`roles/chip.js`: `openOverlay` as above; a second click closes: keep the returned id, `closeOverlay(id)`); (b) a strip click opens `role: "brief", tab`; (c) a key. Same `key` replaces in place, so (a)/(b) never stack two windows.
- **Key route.** `mod.open` takes only a name: `herdr.d.ts:76` `"App: mod.open {name}, overlay.close {id?}"`, `AGENTS.md:603` `"mod.open {name} (again: closes it)"`. It cannot pass props. So (c) is a key bound to a mod command: `AGENTS.md:491` `"<mod>.<command> (delivered to that mod's nextCommand())"` e.g. `keys.json` `"global": {"alt-r": "tab-recap.fleet"}`; `AGENTS.md:800` `"<mod>.<command> reaches shown copies only"`. The always-shown **chip copy** runs `cx.spawn(async cx => { for (;;) { const c = await nextCommand(); ... } })` (`herdr.d.ts:395-402`) and opens the window. Commands: `fleet` (toggle), `brief` (toggle for the focused tab). **Spelling conflict**: `herdr.d.ts:396` says `"<mod>:<command>"` while `AGENTS.md:491` says `<mod>.<command>`: U0 spike decides (`herdr-app commands` after sourcing visual-env). Fallback `mod.open tab-recap` with `mod.json` `overlay` (default role fleet); whether `kind/key/keep` are honoured in `mod.json` is unverified (shipped examples only use `kind`, `at`, `offset`, `width`, `height`: `picker/mod.json`).
- **Dragging**: every row and button must stop the press: `AGENTS.md:250` `.on_mouse_down("left", (_e, cx) => cx.stop_propagation())`. The title bar is the drag handle (leave it unstopped), its buttons stop.
- **Keyboard**: the window does not take it on open. `init` creates `this.handle = cx.focus_handle()`, root `.id("tab-recap").track_focus(this.handle).on_key_down(...)`, and `cx.timer.after(FOCUS_MS, () => this.handle.focus())` (the old mod does this, main.js:`isOverlay() ... cx.timer.after(FOCUS_MS`).
- **Close**: Esc in Fleet calls `closeOverlay(props().overlay)` (the mockup's Esc in Fleet is a no-op, nothing to close). The mockup bar has no close button: see D.13 item 1.

### D.3 The chip

- `AGENTS.md:366-388` floating blocks (:372 sizing, :386 content only): `"floating": [ { "id": "board", "content": { "mod": "board" }, "edge": "left", "align": "center", "peek": 52 } ]`; `"A floating block sits over its node, edge ... and align ..., 12 px in. It sizes to its content (render nothing to hide it). People drag it anywhere; on release it springs to the nearest edge and third, and Herdr saves the new spot."`; `"Herdr draws the frame around a floating mod (theme background, border, rounded corners, shadow; accent border while dragged) ... The mod draws only its content, no panel"`; `placement()` (`herdr.d.ts:254-263`).
- Layout recipe (the installer writes this into the user's layout, never edits a shipped one): `~/.config/herdr-app/layouts/main-recap.json:157-166` already does it for the old mod: `{"id":"tab-recap","content":{"mod":"tab-recap","props":{"role":"chip"}},"edge":"bottom","align":"end"}` inside the root `floating` array.
- Content from live data: counts over `spaces().flatMap(s => s.tabs)` with `status !== null`: `blocked`, `working`; worst = first of `STATUS_ORDER` present, else `idle`. Text exactly as the mockup: `${b} need${b===1?'s':''} you` (bold) and `${w} working`. `alert` = `b > 0`.

### D.4 Pane header strip

- `AGENTS.md:341-364` (:355 header props): `"header": { "content": { "mod": "pane" }, "height": 30, "position": "top", "reveal": "always" }` in the tab block's `pane`; `"header: a mod drawn on each pane, one copy per pane, with props().pane and props().terminal. It reads its live facts from panes() ..."`.
- Recipe: `"header": { "content": { "mod": "tab-recap", "props": { "role": "strip" } }, "height": 34, "position": "top", "reveal": "always" }` (the mockup strip is `min-height: 34px`). Stored as a **clone** of the user's layout (`layout.clone`, `AGENTS.md` "Herdr's own layouts ... are replaced whole"), never an edit of a shipped layout.
- The strip finds its pane: `pane/main.js:33` `panes().find((p) => p.pane === props()?.pane)`; its terminal `p.terminal` (null for a mod pane); its lane: `idx.lanes.find(l => l.terminal === p.terminal)`; its tab `p.tab`. Not an agent pane: see D.13 item 7.
- One strip per pane must not run timers: no `cx.timer` in `strip.js`; it re-renders when live data or `shared` changes. The store polling and the file watch run in the **chip copy only** and publish to `shared("tab-recap.rows")` (a small object, written only when the content changed) which every strip reads (`AGENTS.md:992-993` `"shared(key)/setShared(key, value) (every mod sees it; setting re-renders all)"`).
- Click on the strip: `openOverlay({... role: "brief", tab: p.tab })`.

### D.5 Popover anchored to a clicked element

- Typed, **unproven in shipped mods** (no shipped mod uses `Popover`, `HoverCard`, `Collapsible` or `Popup`; only the `.d.ts` files mention them): `gpui-kit.d.ts:21056-21080` `Popover` "A surface anchored to a trigger and opened by a press. It owns the press, the anchoring, the dismissal — outside press, Escape — and the focus ... Controlled the way a `Checkbox` is"; slots `trigger(el)` (:671) and `content(el)` (:645); `open(bool)` (:1155-1170), `on_open_change((open, cx) => ...)` (:895-909), `anchor("top_left"|"bottom_left"|...)` (:1183, `Anchor` :265), `overlay_closable` (:1176).
- Primary: the lane chip is the trigger, `Popover.new("compact-<i>").open(this.compact === i).on_open_change(...).anchor("bottom_left")` and the content is `roles/compact.js`. Whether `bottom_left` means "below the trigger" and whether the surface may overflow the overlay window's bounds is U0 spike item 3.
- Fallback (verified API): a second overlay, `openOverlay({ mod: "tab-recap", kind: "popup", at: {x, y}, width: 340, props: { role: "compact", tab, terminal } })` (`herdr.d.ts:340,360` `at?: "pointer" | { x; y }`, popup default at the pointer; Esc and outside click close). `ClickEvent` has no position (`gpui-kit.d.ts:438-441`), so take it from `on_mouse_down` (`MouseButtonEvent.position`, `bounds?`, `:495-499`) of the lane chip: `at = {x: bounds.x, y: bounds.y + bounds.height + 8}` if `bounds` is present, else `"pointer"`.
- The stepper is **in the lane chip** (not in the popover), exactly as the mockup: Compact closes the popover and the chip shows the stepper while the document's stage is running (A.2).

### D.6 Keys

- `AGENTS.md:909-913` (UI, keyboard at :912): `"keyboard: this.h = cx.focus_handle() in init, .track_focus(this.h).on_key_down((e, cx) => …), this.h.focus()"`; example `mods/confirm/main.js:28-31` `.track_focus(this.handle).on_key_down((e, cx) => { if (e.key === "enter") ... else if (e.key === "escape") ...`.
- `gpui-kit.d.ts:459-471` `KeyEvent`: `key` is the lower-case key name (`"escape"`, `"enter"`, `"j"`, `"1"`, `"/"`), `keystroke`, `modifiers`. Map from the mockup: `j k` move, `enter` open, `/` focus the search input (`InputState.focus()`, :21339 area), `1`..`4` views, `c` compact, `r` refresh, `escape` back/close. Ignore events with `modifiers.control|alt|platform` like `app.js`. While an input has the keyboard the window handle does not receive keys: `escape` in an input blurs it (`on("blur")`) and `this.handle.focus()`.
- Key names are constants in `constants.js` (`KEYS`), the footer hint rows are built from the same constant.

### D.7 State: `localStorage`, `shared`, `setShared`

- `AGENTS.md:997` `"Other built-ins: localStorage (per mod copy)"` and `AGENTS.md:992-993` `"shared(key) / setShared(key, value) (every mod sees it; setting re-renders all)"`, `herdr.d.ts:389-393` `"Reads a value every mod can see (persisted)"`, `AGENTS.md:88` `"Shared state is saved atomically in the background, with the latest change winning."`.
- Roles are separate copies (chip, strip per pane, window, popup), so `localStorage` of one is not guaranteed visible to another and its survival across a window close is unproven. Use `shared` under `tab-recap.*` keys: `tab-recap.seen` (A.6), `tab-recap.rows` (D.4), `tab-recap.notified` (D.12), `tab-recap.view` (last view and selected tab, so a reopened window returns where it was). `localStorage` only for per-copy conveniences (search text), always in `try/catch`.
- `setShared` re-renders every mod: write only on change, never in `render`, at most on leave events and the `POLL_MS` store tick.

### D.8 Icons and shapes

- `gpui-kit.d.ts:20273-20281` `svg(path)`: `"A vector image from the application's own directory. The path resolves against the application root ... It inherits the surrounding text color unless it sets its own."` `AGENTS.md:802` `svg("mods/<name>/icon.svg") (tinted with the text color)`. Shipped use: `svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)` (`pane/main.js:66`); the spinner file is a ring plus an arc with `stroke="currentColor"`. `spin(ms)` at `gpui-kit.d.ts:1218` ("Turns an svg once every ms ... ms at least 100").
- So there is **no inline path**: each icon is a file `gui/icons/<name>.svg`, referenced as `mods/tab-recap/icons/<name>.svg` with the prefix declared once in `constants.js` (`PATHS.icons`). The same colour tints the whole file, so the blocked `!` is a cut-out hole (even-odd path), not a `--cut` colour. `working` = ring at 25 % opacity plus arc, `.spin(1000)` (`ic-working .arc` spin 1 s). `unknown` = dashed ring via `stroke-dasharray` in the file. `image()` keeps colours but cannot be tinted: not used for status.
- `PathBuilder` exists (`gpui-kit.d.ts:20368-20381`) but no shipped mod draws with it; not used.

### D.9 TextView.markdown, scroll, hover, collapsible

- `AGENTS.md:921`, `gpui-kit.d.ts:20701-20712`: `TextView.markdown(id, markdown)` returns `TextViewElement` with `on_link_click(handler)`, `selectable()`, `scrollable()`. Used for the Story paragraph (links from `spans` become `[text](url)`; `on_link_click` -> `openLink(url)` argv `exec("xdg-open", [url])`, WEB-url check kept). Nothing else is markdown (the mockup draws plain text).
- Scroll: `.overflow_y_scrollbar()` on the element that scrolls (`gpui-kit.d.ts:1093`, `AGENTS.md:909`), with a stable `.id(...)`; the Brief body and the feed (max height 280) each have their own. Wheel: `on_scroll_wheel` (`:785-792`) only if a handler needs it (none does). Feed day headers cannot be sticky (D.13 item 4).
- Hover: `.tooltip(text)` takes a string only (`gpui-kit.d.ts:940-947`: shown after the pointer rests; "It takes a string, not an element"). Used for the strip headline and icon-only buttons. Timeline bin preview needs rich content: `HoverCard.new(id)` with `trigger(bar)` and `content(card)`, `open_delay`, `close_delay` (`gpui-kit.d.ts:21081`, `:1185-1198`): unproven, U0 spike item 4; fallback is `on_hover` storing the bin in state and drawing the card in the view's own tree.
- Decisions "details": a plain state set `this.openDecs` and `.when(open, el => el.child(why))`; `Collapsible` (`gpui-kit.d.ts:21054`) only gates content, adds no chevron or toggle: not needed.
- Search and note fields: `InputState.new(...)` + `Input.new(state)`, `TextareaState.new({placeholder, rows})` + `Textarea.new(state)` (`gpui-kit.d.ts:21330-21369`, `:21399-21427`). `TextareaState` has **no maxlength**: `state.on("change", ...)` clips with `set_value(value.slice(0, NOTE_MAX))` and the counter reads `value().length`.

### D.10 Actions that have no command yet

`bin/tab-recap-desktop.ts:44-51` commands: `ensure start stop status refresh doc`. There is no `compact` or `reply` for the desktop (the CLI `compact` exists, `bin/compact.ts`, but typing into agents needs the P4 proof, `roadmap.md` lines 80-84). Until then: the lane chip, popover, textarea, counter, Cancel and Compact are drawn and usable up to the Compact press, which calls `compactLane` and shows `Not available yet` through `.tooltip` and a muted line in the popover; the Reply field and Send are drawn disabled (`.disabled(true)`, `opacity(0.5)`). A single constant `ACTIONS_ENABLED = { compact: false, reply: false }` flips them when the command exists. The stepper and toast work today for compactions started elsewhere (TUI, autocompact) because they read the document.

### D.11 Jump, refresh, markers

- Jump: `run("tab.select", { id: tab })` then `run("pane.focus", { terminal })` (`herdr.d.ts:53-58`, `:58` `pane.focus {pane | terminal}`). Whether `tab.select {id}` of a tab in another space also switches the space is unverified (spike item 6; else `space.select {id: space.id}` first, from `spaces()`).
- Refresh: `exec(bin, ["refresh", tab])` (`SAFE_TAB` checked, argv array). "Refresh all": the command takes one tab: loop sequentially over rows whose status is not `idle`, max `REFRESH_ALL_MAX`. (An optional `refresh --all` in `tab-recap-desktop` is a later engine step.)
- The daemon reads `open.<tab>` marker files (`src/adapters/desktop-expanded.ts:100-107`, `OPEN_MARKER_PREFIX 'open.'`, fresh for 60 s, `desktop-constants.ts`): it only decides whether the story is curated while someone looks. The Brief role must keep touching `<stateDir>/gui/open.<encoded tab>` while a brief is open (every `MARKER_MS`=20 s, `exec("touch", [path])`) and remove it on leave and in `close()`, as the old mod does (main.js:`mark/unmark`). Fleet and strip never touch it.

### D.12 Toasts and notifications

`herdr.d.ts:370-379` `notify({ title, body, level, icon, timeout, action: { name, args } })`: "Shown by the `toast` mod ... runs `action` when clicked." The mod posts one when it observes `stage === "compacted"` for a lane whose `stageAt` is within `STAGE_FRESH_MS` and whose key `<tab>:<terminal>:<stageAt>` is not in `shared("tab-recap.notified")`: `title "Compacted, 78% to 21%"`, `body "<lane name> · 43 s"`, `level "success"`, `action { name: "pane.focus", args: { terminal } }`. Only the chip copy does this (one source). The app already posts "needs you" itself: the mod posts nothing for needs.

### D.13 What the mockup does that the API cannot (each with its nearest form)

| # | Mockup | Limit (source) | Nearest supported form |
| --- | --- | --- | --- |
| 1 | window has no close control | window overlays close only through `closeOverlay`/Esc (`herdr.d.ts:341-345`) | Esc closes from Fleet. Decision for the maintainer: add the mockup's own `close` icon button after the gear |
| 2 | chip inside the status bar row | a floating block is framed by Herdr, 12 px in from an edge, draggable, separate from `workspace-status` (`AGENTS.md:366-388`); shipped `workspace-status` cannot be edited | floating block bottom-end; chip draws content only; the frame is Herdr's |
| 3 | chip `pulse` (box-shadow ring) | no box-shadow animation; `loop` animates `opacity`, `width`, `height`, `left`, `top` only (`gpui-kit.d.ts:1213`, AGENTS.md:898) | a 6 px `blocked` ring div behind the chip with `.loop("opacity", {from: .25, to: 1, period: 1800})` while `alert` |
| 4 | sticky day headers, `letter-spacing` on card titles | no `sticky`, no letter-spacing in `gpui-kit.d.ts` | headers scroll with the list; titles uppercase without tracking |
| 5 | `details/summary` | none | state toggle (D.9) |
| 6 | popover positioned by `getBoundingClientRect` | `ClickEvent` has no position (`gpui-kit.d.ts:438`) | `Popover` anchor or popup `at` (D.5) |
| 7 | strip only on agent panes | one `header` per layout, `reveal` is per layout, height reserved on every pane (`AGENTS.md:349-364`) | `reveal: "always"`; non-agent panes render the neutral line of the shipped `pane` mod (icon, title, folder in `dim`), no meter. The strip **replaces** the `pane` header, so its split, zoom and close buttons are gone: decision for the maintainer (add the four buttons on hover as `pane/main.js:50-59`, or keep the strip clean) |
| 8 | `textarea maxlength` | none (D.9) | clip in `on("change")` |
| 9 | rich hover card on bars and headline | `.tooltip` string only | `HoverCard` or in-tree card; headline uses `.tooltip(text)` |
| 10 | toast with an inline `Jump to lane` button | toasts are the global `toast` mod, click runs one `action` (`herdr.d.ts:370-379`) | whole toast clicks to jump |
| 11 | per-step seconds on finished stepper steps | not in the document (A.8 item 5) | current step only |
| 12 | `Settings` gear action | no settings in this phase (U6) | drawn, inert, `.tooltip("Settings")` |
| 13 | `Reply`, `Compact` run | no desktop command (D.10) | drawn, disabled until enabled by constant |
| 14 | `color-mix` tints, `--shadow` | no CSS | `color + alpha` hex; Herdr frame shadow |
| 15 | violet token | not in `theme()` | `ansi5` |
| 16 | multi-colour icon (`--cut`) | `svg()` is one tinted mask | cut-out path |
| 17 | `max-width: 780` Fleet centred in page | a window has a fixed `width/height` | `width 780`, height 620; the rows list scrolls |
| 18 | `.ic-spin` keyframes | `spin(ms)` | `svg(...).spin(1000)` |
| 19 | URL params, scene buttons, page chrome | mockup only | dropped |

### D.14 Fleet row set

Fleet shows every tab of every space: rows = live tabs with `status !== null` (or an index row) joined with index rows by tab id.
A live tab without an index row shows name, live status, headline from the focused agent title (`agents()[].title`) in the muted
colour and no meter. An index row whose tab is not live is dropped. Search `q` matches `name + space + headline` lower-cased. Filter
toggles and counts use the displayed status.

### D.15 Work split (two builders)

- **Builder 1, data and engine:** B (all of it, including tests), then `constants.js`, `time.js`, `commands.js`, `store.js`, `seen.js`,
  `derive.js`, `keys.js`, the F harness and its data tests. Delivers the `TabRow` and `BriefModel` objects of C.
- **Builder 2, view:** `theme.js`, `icons/*.svg`, `ui/*`, `views/*`, `roles/*`, `main.js`, `mod.json`, layout recipes, screenshots in the
  isolated session. Consumes the objects of C; until Builder 1 lands, uses fixtures shaped like those objects.
- **Order:** U0 spike (D.2 key spelling, D.5 popover, D.9 hover card, lane/terminal match, jump, `mod.json` overlay keys) before
  Builder 2 starts `roles/window.js` and `roles/compact.js`.

---

## E. Visual parity checklist for the isolated run

After `source ~/.cache/hcs/visual-env.sh` (never the live app), render with `herdr-app shot`: fleet dark and light, brief blocked
light, brief working with stepper, compact open, timeline dark and light, strip and chip in the layout. Compare against `shots/v2/*.png`
element by element (shape, colour role, order). The harness (F) cannot see pixels.

---

## F. Render-tree test harness

### F.1 Where and how it runs

`test/gui-mod/*.test.ts` (matched by `ci/test.sh` `bun test "test/**/*.test.ts"`; register new files with `bun ci/lanes-generate.ts`).
`ci/test.sh` passes no `--import`, so each test file registers the fakes itself and then `await import(...)`s the mod:

```
module.registerHooks({ resolve(specifier, context, next) { fake = FAKES[specifier]; return fake ? { url: fake, shortCircuit: true } : next(specifier, context) } })
```

`module.registerHooks` exists on the pinned Node (checked: `typeof require('node:module').registerHooks === 'function'` on 24.22.0; it
is marked active development, so the harness isolates it in `test/gui-mod/fakes/register.ts` and the F.6 risk covers a fallback to
`module.register` with a loader file). `FAKES` maps `gpui-kit`, `gpui-base`, `herdr` to files in `test/gui-mod/fakes/`. The mod
(`gui/**/*.js`, `type: module` from `package.json`) is imported by file URL after registration. Globals the runtime provides are set on
`globalThis`: `localStorage` (Map-backed), `console`.

### F.2 What the fakes provide

- **`gpui-kit` / `gpui-base`:** `div() h_flex() v_flex() svg(path) image(path) TextView Popover HoverCard Popup Collapsible Input InputState
  Textarea TextareaState Button Link Scrollbar PathBuilder View`. Every builder returns a `Node` (a `Proxy`): any method call is
  recorded as `calls: [name, args][]` and returns the node; `child/children/trigger/content` append to `children`; `when(cond, fn)` runs
  `fn` when truthy; `hover(fn)` and `range_style(fn)` run `fn` on a detached node and keep its calls; `id(x)` sets `id`; event methods
  (`on_click on_key_down on_mouse_down on_hover on_scroll_wheel on_size_change on_open_change on_link_click`) store the handler.
  `svg(path).spin(ms)` and `.loop(...)` are kept as calls.
- **Tree helpers:** `find(root, pred)`, `all(root, pred)`, `byId(root, id)`, `text(node)` (concatenated string children),
  `style(node, "bg")` (last call args), `icons(root)` (all `svg` paths), `click(node)`, `mouseDown(node)`, `key(root, "j")`
  (dispatches to the nearest `on_key_down` with `{key, keystroke, modifiers}`), `type(node, value)`.
- **Fake `cx`:** `notify` counter, `spawn(body)` (runs the body with a fake async cx, returns the promise), `timer.every/after` registered
  and fired by `advance(ms)`, `focus_handle()` returning `{focus(){calls++}, is_focused()}`, `stop_propagation` counter, `sleep`.
- **`herdr`:** a programmable `world`: `spaces agents panes focused theme` (two themes: graphite dark values and paper light values, real
  token names from `herdr.d.ts:265`), `files: Map<path, text>` behind `readTextFile`, `watchFolder` a promise resolved by `world.touch(path)`,
  `exec` records `{command, argv, cwd}` and answers from a table (`printenv`, the desktop binary), `run`, `openOverlay` (returns ids,
  records specs), `closeOverlay`, `notify`, `shared/setShared` (Map, with a render counter), `props()` set per test, `nextCommand()` fed by
  `world.command("fleet")`, `home()`, `appHome()`, `placement()`, `window()`. Unset functions throw so an unexpected API use fails the test.

### F.3 Assertions that give value

1. **Router:** each `role` builds its view; absent role is `fleet`; unknown role renders the named error line.
2. **Engine -> mod, one fixture:** build a real v2 document with `guiTabOf(...)` and its `guiIndexRow(...)` from a fixture recap (the
   same path the daemon uses), write both into `world.files`, run store -> derive -> role tree. This catches contract drift: headline
   rule, `needs`, `waitingSince`, `contextPercent`, lane stage, `compactHint`, old-row defaults. Highest-value test.
3. **Fleet:** grouping and order by `STATUS_ORDER` with `done` before `working`; live status wins over index status; filter toggles and
   counts; search over name+space+headline; a live tab without a row; a closed tab's row dropped; headline red iff `needs > 0`;
   `waiting N min` only with `waitingSince`.
4. **Shapes and colour roles:** per status the status icon path is the constant for that shape and the colour call is the right token
   (`blocked` disc, `done` check, `working` ring with `spin`, `idle` ring, `unknown` dashed); meter fill token flips to `working` at
   `>= hint`; tick position = `hint`%; pill tint is `token + alpha`; decisions tick uses the violet token; light theme changes only colours.
5. **Lane chip and stepper:** hint border, `compact?` label, popover opens on click (Popover `open` true / popup spec), Compact is inert
   while `ACTIONS_ENABLED.compact` is false, stepper steps `ok/now/idle` from `stage`, `Compacting` pill, terminal stage clears it, toast
   `notify` fired once per `stageAt`.
6. **Keys:** `j k Enter / 1 2 3 4 c r Esc` per state (fleet, brief, popover open, input focused); Esc order (popover, brief -> fleet, fleet
   closes); modifiers ignored; resulting `run`, `openOverlay`, `exec` calls.
7. **Commands:** every `exec` has an array argv; the tab id goes through `SAFE_TAB` (a hostile id such as `x;rm -rf` produces **no**
   exec); the desktop command words are the constants; marker touch cadence and removal on leave.
8. **Overlays:** chip click and `nextCommand("fleet")` produce `openOverlay({kind: "window", key, keep, width, height, props.role})`;
   strip click opens `role: "brief"` with the tab; a second chip click closes.
9. **Seen:** the banner counts use the value held at open; the write happens on leave only; missing entry uses `FIRST_LOOK_MS`; v1 doc says
   `nothing new`; counts match A.6 for a fixture with known `firstAt`.
10. **Timeline:** binning (counts, dominant section tie-break), axis labels use `doc.zone` (two zones, one fixture), day separators,
    bin click filters the feed, clear range, cuts line, older-than-window line.
11. **Strip:** finds its lane through `props().terminal`; non-agent pane renders the neutral line; compacting pill; no `cx.timer` call.
12. **Source gates over `gui/**/*.js`** (the oxlint exclusion makes this the only gate): no `//` or `/*` comments (token scan that
    skips string and template literals), no `setTimeout`/`setInterval`, no `node:` import, no `require`, no `exec(` call whose first
    argument is `"sh"` or `"bash"`, no hex colour literal outside `theme.js` and `constants.js`, no `localStorage` outside `try`. A
    scan, not a parser: a false positive is fixed in the source, never by loosening the scan.

Not worth asserting: pixel sizes, exact paddings, font sizes, animation timing, `Popover` placement geometry (the fake cannot lay
anything out), real focus or real key delivery (neither the harness nor `herdr-app` can send input; the maintainer's QA covers it,
`ux-plan.md` section 7).

### F.4 Real checks outside the harness

`herdr-app check gui/` (after `source ~/.cache/hcs/visual-env.sh`) per role props, then `herdr-app shot`.

---

## G. Risks and unresolved

1. **Popover and HoverCard are typed but unproven** (no shipped mod uses them). Fallbacks are specified (popup overlay at `at`, in-tree card). U0 spike.
2. **Key command spelling** `tab-recap.fleet` (AGENTS.md:491) vs `tab-recap:fleet` (herdr.d.ts:396). Spike.
3. **`mod.json` overlay** fields beyond width/height/kind/at are unverified; the chip-copy route avoids needing them.
4. **Lane id match** (`lane.pane` is the terminal address, old main.js:341) is unverified with real agents; the smoke document has no lanes.
5. **`shared` write cost**: `setShared` re-renders every mod. Writes are limited to change, leave and the poll tick.
6. **`module.registerHooks`** is active development on Node 24.22: fallback `module.register` with a hooks file.
7. **Pane header strip** reserves a row on every pane and drops the shipped split/zoom/close buttons (D.13 item 7): maintainer decision.
8. **Window close affordance** missing in the locked view (D.13 item 1): maintainer decision.
9. **Engine dependencies**: `compactHint` and the index fields (B) must land before Fleet shows meters with a real tick; compact and reply
   commands need the P4 proof. Until then the UI is complete but those two actions are inert (D.10).
10. **Timeline window**: 48 h fixed; a session older than that shows `N older not plotted`.
11. **Remote machines**: tabs of other machines have no document; Fleet shows live data only; `exec` runs locally.
12. **Document size**: `readTextFile` reads up to 1 MiB and the engine cap is exactly 1 MiB (`GUI_TAB_LIMIT`): a document at the cap is at the edge. The store treats a null read as "no document".
13. **Facts cut** (`cuts[]`) make Needs/Decisions counts smaller than reality; the banner and filters count what the document holds, and the cut line says so.
14. **Marker files**: dropping them would silently stop story curation while a brief is open (D.11): kept.
15. **Multi-task tabs** are aggregated with a task prefix, a layout addition the mockup does not show (A.1).
16. **Old overlay removal**: `gui/main.js` and `RECIPE.md` are replaced in the same change; `preview.png` is regenerated from the isolated run.
