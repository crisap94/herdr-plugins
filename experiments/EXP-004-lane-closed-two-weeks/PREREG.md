# EXP-004 pre-registration

Frozen before the first run that counts. Source: the OpenSpec change `autocompact-lane-closed` (archived), design sections "Deferred" and "Context".

## Question

After the closed-lane end, the board checks between the expensive steps and the stored lane status landed (plugin 2.5.0, live from 2026-10-11 about 11:30 UTC), how often does a compaction still lose its lane while the brief's writer runs, and what status did those lanes have when they were decided?

## Metrics

- Lane closed ends: compaction records that ended `skipped` with why `lane closed`, per day, over a window of at least 7 days (planned: 14 days, run on 2026-10-25).
- Lane closed ends with the writer: those that spent at least 10 s between start and end (the writer ran).
- Share of the baseline: the per-day rate above divided by the baseline of 9.5 a day (15 `agent_not_found` failures in about 38 hours before the change).
- Lane status at the decision of the automatic lane closed ends (`idle`, `done`, `working`, not recorded), from `autocompact_decision.lane_status` through `compaction_id`.
- Guardrail: compactions still ending `failed` with `agent_not_found` (expected 0).

## Decision rules (proposed by the CTO of this stream; the maintainers may change them before the run)

- C2, cancel the writer when the lane closes: specify it if the per-day rate of lane closed ends with the writer is at least half of the baseline; drop it if below a fifth; between the two, extend the window by one week.
- E, do not brief `done` lanes below the ceiling: evaluate it if at least 10 automatic lane closed ends exist and at least 60 % of them were decided on a `done` lane; drop it if under 25 %; between the two, extend by one week.
- A window shorter than 7 days decides nothing.

## Method

`measure.mjs` opens `tab-recap.db` read-only and prints the tables and the verdicts of the rules; the points where compactions were (before the brief, after it, before a rewrite, before typing) come from the daemon log lines `compaction: <agent> <pane> closed, skipped (<point>)`, which rotate, so they can undercount. Command: `node experiments/EXP-004-lane-closed-two-weeks/measure.mjs 2026-10-11T11:30:00Z 2026-10-25T12:00:00Z`.
