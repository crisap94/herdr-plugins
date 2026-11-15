# Final visual test of the locked Tab Recap view

Run against the isolated session only (core session `sp`, `HERDR_APP_HOME=~/.cache/hcs/app`, state `~/.cache/hcs/final-state`). The window ran on a private Xvnc display (`:77`), because the real display was in power-save and the compositor sent no frames, so `herdr-app shot` froze on the first frame. `TAB_RECAP_BIN` pointed at a stub that logs each call and forwards only `refresh` to the real CLI; `xdg-open` was a stub on `PATH`.

Fixtures: the five mockup tabs as GuiTab v2 documents, each validated with `v2Problems`, plus an `index.json` in the engine's new format, all written by the real `guiTabOf`, `encodeGuiTab` and `guiIndexRow` (`make-fixtures.mjs.txt`). Cart totals and Migrate runner have two lanes; Migrate runner has a compaction record (`compacted`, or `compacting` for the stepper shot); the stale variant sets `versions.stale`. Tab ids are the herdr tab ids of the isolated window; lane terminals are its terminal ids.

Interactions came from a TEST-ONLY copy of the mod in the isolated app home with a command-file hook; the hook is not in `tab-recap/gui`.

## Checks

| Check | Result | Evidence |
|---|---|---|
| Strip, blocked pane (red headline, meter, tick) | pass | strip-blocked.png, chip.png |
| Strip, working pane (amber meter past the hint) | pass | strip-working.png |
| Strip, done pane (green check) | pass after fix 1 | strip-done.png |
| Strip, per-lane context (docs lane 18%) | pass | strip-lane-ctx.png |
| Strip, tab without recap | pass (falls back to the agent title) | strip-no-recap.png |
| Chip `1 needs you 2 working` with ring | pass | chip.png |
| Fleet dark, urgency groups, filters, search, meters | pass | fleet-dark.png |
| Fleet light | pass | fleet-light.png |
| Fleet j, k, Enter | pass | ix-fleet-j.png, ix-fleet-k.png, brief-blocked.png |
| Brief blocked (need card, Jump to lane, decisions, links) | pass after fixes 3, 4 | brief-blocked.png, brief-blocked-light.png |
| Brief working, compaction hint amber | pass | brief-working.png |
| Compact popover open (popup overlay, hint line, note, Cancel, disabled Compact) | pass | compact-open.png |
| Stepper running inline on the lane chip, `Compacting` pill | pass | compact-running.png |
| Timeline dark and light, bins, axis, day separators, filters | pass after fixes 2, 5 | timeline-dark.png, timeline-light.png |
| Story, Session | pass | story.png, session.png |
| Stale daemon notice and Restart | pass; Restart ran `stop`, `start`, `ensure` | stale-daemon.png, cli.log.txt |
| No recap document notice | pass | no-recap.png |
| Version 1 document notice | pass | v1-document.png |
| Refresh queued | pass; `refresh <tab>` argv, row of kind `refresh` in the isolated database | cli.log.txt |
| Link opens | pass; https went to `xdg-open`, `file://` did not | xdg-open.log.txt |
| Open marker | pass; created on open, touched at 20 s, removed on back | shell transcript |
| Jump to lane | pass; selected the tab and focused the lane's pane | status after the call |
| Tab switching | pass | strip-*.png |

## Defects fixed in `tab-recap/gui`

1. Done was drawn with the host `done` token, which is blue in the default theme; the locked look says green. `theme.js` now takes `ansi2`.
2. `Intl is not defined` in the Timeline view (the host runtime has no `Intl`), so the view fell back to the previous frame. `time.js` now uses `Date` in the window's local zone, with month and weekday names in `constants.js`.
3. The Brief breadcrumb wrapped onto two lines; it is now a one-line flex row (`roles/chrome.js`, `text.js`).
4. The need card's `Send` button overflowed the card; the reply field now shrinks (`views/brief.js`).
5. The first timeline axis label was clipped at the left edge; labels near either edge are dropped (`views/timeline-plot.js`, `metrics.js`).

## Differences from the mockup

- The compact popover is a `popup` overlay opened under the lane chip, not an in-tree card. Compact and Reply are disabled until typing into agents exists.
- The window is a fixed 780 by 620, so the lists scroll where the mockup window was taller.
- The need card shows `fact.why`; the document has no options.
- Story shows the text only; the document has no chapter titles. Session tiles show the fields the document has (no turns, files edited or unpushed commits).
- Tiles and chips fill the row width; the mockup used fixed widths.
- Fleet heading is `Done`, not `Done, unseen`, and the group order follows the live tab status from herdr (a done tab that has been looked at is idle there).
- Per-step compaction seconds exist only for the current step.
- Times use the window's local zone, not the document's `zone`.
- The strip shape is the live pane status; the headline is the tab's.
- Timeline bars are wider (the plot is narrower); day headers are not sticky.
- Blue is the host accent, so the selection rail and links match the host theme, not the mockup's exact blue.

## Not verified

Real key, click and wheel input (handlers were called through the hook); lane-chip bounds for the popover anchor (the hook passed fixed bounds); dragging the Fleet window; keys while a field has focus; light theme for the strip and chip (Fleet, Brief and Timeline were shot light); compaction toast timing; a real daemon rewriting the index (the stub kept the fixtures).
