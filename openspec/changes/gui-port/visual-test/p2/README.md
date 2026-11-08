# Phase 2 visual test of the desktop mod (Recap and Full views)

Run on 2026-11-07 in the isolated session (`HC_SESSION=sp`, own app home `~/.cache/hcs/app`, own scratch state dir). The mod
under test is `tab-recap/gui/main.js`, installed into the isolated app home. The daemon was stopped, so the mod read only the
fixtures in `fixtures/` (placeholder tab id replaced by the real tab id). `TAB_RECAP_BIN` pointed at a stub that logs its
arguments (and forwards `refresh` to the real CLI against the scratch database); `xdg-open` was a stub that appends the URL to a file.

How input was driven: `herdr-app` has no key or click command, and pointer or key automation on the real display is not allowed.
So keys, button clicks and link clicks went through a test-only copy of the mod: the same `main.js` plus a 300 ms timer that
read a command file and called the mod's own handlers (`key()`, `setView()`, `refresh()`, `restart()`, `open()`). The
`on_click` and `on_key_down` wiring was therefore NOT exercised by a real pointer or keyboard. The shipped `main.js` has no hook.

| Check | Result | Evidence |
| --- | --- | --- |
| Recap view, 10 fixtures (working, blocked, idle, done, updating, error, no-recap, stale-daemon, compaction-stage, rich) | pass after fixes | `<state>-recap.png` |
| Full view, same 10 fixtures | pass after fixes | `<state>-full.png` |
| Status dot colours (working yellow, blocked red, idle grey, done blue) | pass | working/blocked/idle/done recap |
| Section order and "—" for empty sections | pass | working-recap.png |
| Recap error in red, warning in red, previous sections kept | pass | error-recap.png |
| "No recap yet ... press Refresh" and lanes only | pass | no-recap-recap.png, no-recap-full.png |
| Compaction stage line (and `compact? N%` hint when no stage) | pass | compaction-stage-recap.png, rich-recap.png |
| Meta line: backend, age, "updating", plugin version | pass | updating-full.png |
| Story "updating..." heading | pass (placeholder text when the story is not written yet) | rich-full-bottom.png |
| Multi-task headers (rich has 2 tasks) | pass | rich-recap.png, rich-full.png |
| Full: needs with waiting time, decisions with reason and `closed: why` | pass | blocked-full.png, rich-full-bottom.png |
| Full: timeline with day separators, compacted and new-session breaks | pass (compacted and new-session breaks both seen) | rich-full.png, rich-full-timeline-break.png, rich-full-timeline-compacted.png |
| Full: session facts block | pass | rich-full-bottom.png |
| Two columns when wide, one column when narrow | pass (460 px single, 760 px and wider two) | rich-w460-full.png, rich-full.png, rich-w1100-full.png |
| Light theme | pass (text readable, accent and red readable) | light-rich-full.png, light-rich-recap.png, light-stale-daemon-recap.png |
| Stale-daemon notice with Restart button | pass (notice shown) | stale-daemon-recap.png |
| Restart button runs `stop`, `start`, then `ensure` | pass (handler call, stub log) | stub log |
| Keys j/k/g/G (handler calls), Recap/Full switch (handler calls) | pass | rich-full-scrolled-j12.png, rich-full-bottom.png, rich-full-top-after-g.png |
| Refresh queues a request | pass: two refresh calls reached the real CLI, `request` table got two `refresh` rows for the tab; the CLI itself printed "recap requested for <tab>" | scratch db, `request_readable` |
| Link opens through xdg-open | pass: the https URL reached the stub; a `file://` URL was refused | stub log |
| Open marker created on open, touched every 20 s | pass: mtime moved from :29.8 to :50.8 | `gui/open.<tab>` |
| Marker removed on close (app close and Esc handler) | pass | marker listing |
| Tab switch while open follows the new tab | pass: second tab opened its own file and marker, selecting the first tab moved the marker and the content | tabs-second-open.png, tabs-after-switch-to-first.png |

## Defects found and fixed in `tab-recap/gui/main.js`

1. Decision stamps read "11/07/2026 04:30:00 AM": the host `toLocaleString` ignores the options. Now built from
   `Intl.DateTimeFormat.formatToParts` with a local-time fallback, shown as the clock for today and `YYYY-MM-DD HH:MM` for older days (as the TUI does).
2. Two columns were used even when the right column was empty (left half width wasted). One column now unless the right column has content.
3. `G` left the end of the document cut off at the footer. It now keeps the last rows that fit the overlay height.
4. The 40-row timeline was one scroll unit, unreachable by keys. It is now split into rows of four lines.
5. The story section was missing while a story was being written but not yet stored. It now shows the heading with "updating..." and a placeholder line.
6. The error line read "Recap error: Recap failed: ...". The document text is shown as it is.
7. Buttons had no visible edge on the light theme. They have a theme border now.

## Fixture defects (fixtures are outside the mod; repaired copies are in `fixtures/`)

The generated fixtures passed the schema but were not shaped like the real builder output: `regions` held fact texts instead of
fact ids (the Full view was empty), the rich timeline referenced ids that had no fact, and the story spans did not cover the whole text.
The repaired fixtures follow `gui-tab-regions.ts` and `gui-tab-spans.ts`.

## Did not work or not checked

- Real pointer clicks, real key presses and the mouse wheel were not exercised (see above). Wheel scrolling relies on `overflow_y_scrollbar`
  and was not tried; no scrollbar showed in the pictures.
- `j/k` scroll by row, not by pixel, and both columns share one position, so the shorter column ends up showing its last rows early.
- The window was 837 px wide when shot, so the 1100 px overlay was clamped to the window; a truly wide window was not tested.
- The daemon "not running" notice (without `versions.stale`) was not forced.
- The mod ran against a stub binary; `ensure`, `start`, `stop` were never run against a real daemon from the mod.
- The first `herdr-app` focus follow timer (1.5 s) was observed to follow a programmatic `tab.select`, not a click on a tab.

## Parity fixes (second run, shots with suffix `-fix`)

Same isolated session and test-only hook copy as above (the shipped `main.js` has no hook). New fixtures `markdown-only.json`
(sections empty, markdown body, a claude recap present) and `files8-story.json` (8 edited files, story time, curating) are in `fixtures/`.

Changed in `tab-recap/gui/main.js`:

1. A task whose sections are all empty draws `task.markdown` (headings, bullet and numbered lists, bold, emphasis, code, links, bare URLs); if the markdown is empty too, the `claudeRecaps` text or "No recap yet" is drawn per task, not only when there are no tasks.
2. Full view story heading: `SESSION SO FAR · <stamp of story.at> · updating…` (stamp grey, updating magenta).
3. Session files: every file, comma-joined as `path (n)`, wrapped; autocompact row moved after it (as the TUI orders them). The files and autocompact rows are a separate scroll row so `G` shows them whole.
4. Colours: stage lines (yellow briefing, compacting, restoring, green compacted, red failed, grey unconfirmed, skipped), badges (`● working` yellow, `● blocked — needs you` red, idle and done green, unknown grey), notes blue, warnings red, prompt dim with `›`.
5. Git note `⎇ branch · N unpushed · N changed` (taken from the doc's git note, built from `lane.git` only when the doc has none); no branch or `↑N` in the facts line.
6. Decision reasons bare and dim; no why line under needs (waiting in yellow); recap error drawn under the columns (end of the column, always visible, red).

| State | Result | Evidence |
| --- | --- | --- |
| markdown-only recap (list, numbered list, code chip, link, bare URL) | pass | markdown-only-fix-recap.png |
| 8 files, story time and updating tag | pass (all 8 files, story `05:15 · updating…`) | files8-story-fix-full.png, -full-bottom.png |
| blocked, error, compaction stage and hint, rich | pass | blocked-fix-*, error-fix-recap.png, compaction-stage-fix-recap.png, rich-fix-* |

Still not verified with real input: key presses, pointer clicks and the mouse wheel (all driven through handler calls); the
failed, unconfirmed, skipped and restoring stage colours (only compacting and the hint were drawn); a story with a real
`story.at` older than today (the stamp shows the date form only by code path); light theme for the new colours (ansi3 yellow
on a light popover may be weak); markdown with nested lists, tables or code fences (the subset renderer does not parse them).
