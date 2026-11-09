# EXP-004 · How often does a compaction lose its lane mid-brief after the closed-lane change, and on which lanes?

| Field | Value |
|---|---|
| Status | planned (run on 2026-10-25) |
| Decision | pending: decides C2 (cancel the writer when the lane closes) and E (do not brief `done` lanes below the ceiling) |
| Owner | the compaction stream (CTO) |
| Dates | window 2026-10-11 11:30 UTC → 2026-10-25 12:00 UTC |
| Parent | OpenSpec change `autocompact-lane-closed` (archived), design "Deferred" |
| Links | the closed-lane change, merge request !119 |

## Question and hypothesis

See [`PREREG.md`](PREREG.md). H1 (C2 pays): closes during the writer stay at or above half of the pre-change rate of 9.5 a day. H2 (E pays): most of the lanes that close mid-brief were `done` when decided.

## Method

`measure.mjs` (read-only on the live store). Provenance and environment: [`manifest.yaml`](manifest.yaml).

## Runs

| Run | Status | What changed | Outcome |
|---|---|---|---|
| R01 | planned | 2026-10-25, whole window | pending |

## Results

Pending the run.

## Anomalies and threats to validity

- The daemon log rotates: the point-reached table can undercount; the database counts do not.
- Only automatic compactions carry a decision, so the lane status is known for automatic ends only.
- An operator or a tool that closes lanes in bursts moves the rate without any change in the plugin.

## Interpretation and decision

Pending.
