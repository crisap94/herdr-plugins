# Proposal — tab-recap performance, fixed at the root

## Why

On 2026-10-14 tab-recap cost about 58 % of all CPU on CT 103, the shared agent host: 29 tab-recap processes used 119.9 CPU-seconds per
minute including the `git` children they spawn, with 6.6 GiB RSS and about 3.7 `git status` running at any moment (baseline in
`evidence/`). Every column is a full copy of the app that polls git, herdr, the database and the config for its own lanes, so 28 columns
poll the same worktrees 28 times. herdr's session restore also leaves plugin panes behind as idle shells (73 on that day), which the daemon
cannot recognise.

The operator asked for a fix at the root, and for the stale panes to stay until then, so the same panes are measured before and after.

## What changes

- The daemon owns every read and learns from events; columns become thin terminals that paint frames the daemon pushes (design O3).
- Worktree status is one shared, event-driven record per worktree instead of one 5-second poll per column.
- Summaries: the existing debounce defaults to 120 s, at most two run at once, and none runs when there is no new text.
- Restored dead columns are recognised under a narrow five-part identity and retired (amends the fifth red line).
- A performance probe and bench, and the proof: `evidence/measure.sh` on the same panes before and after each landing.

## Impact

`tab-recap/` only. Three landings, each reversible on its own (design §6). The fifth red line changes, which needs the operator.
