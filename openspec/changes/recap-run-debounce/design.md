# Design

## Evidence

From 32.3 hours of live data (816 recap runs, $3.83 of recorded writer spend), read from a copy of the tab-recap database
taken on 2026-10-10. Figures marked **reading** are interpretation.

| Fact | Count | Notes |
|---|---|---|
| Runs starting less than 60 s after the previous run on the same tab | 223 of 816 (27 %) | |
| Their spend | $1.21 (32 % of recorded writer spend) | |
| Concentration | orchestrator tab A 95 runs, tab B 27, tab C 24 | three orchestrator tabs |
| Cost per run, 10-09 against 10-10 | $0.0030 against $0.0057 | the rise is input size, addressed by the ledger-pruning change |
| EXP-001 bar, cost per turn (R10) | $0.0032 | the bar is per turn, so merged runs must be compared per turn of text read |

**Reading.** A burst run reads the turns that arrived since the previous run through the cursor, so its input is small in
turns but carries the whole ledger. Merging a burst into one run saves the ledger's per-run input for every merged run. The
saving is at most the cost of the runs a window merges into a neighbour. The data cannot say how many runs a given window
merges, because the window is not in use yet; the replay in the verification section measures it.

## Current code

`RecapJob.request(tab, lanes, cause)` (`src/recap/application/recap-job.ts`) keeps one `Slot` per tab:

- a `turn-ended` request arms a timer of `TURN_SETTLE_MS` (2 500 ms); another request for the same tab clears the timer and
  arms it again with the newer lanes, so a burst already merges while the timer is pending;
- a `focused` or `requested` request arms a timer of 0;
- while a run is in progress, a new request is kept as `again` and runs when the first finishes, replacing any earlier one.

What is missing is a floor between the start of one run and the start of the next. A burst that spans more than the settle
delay is therefore one run per 2.5 seconds at worst, and the 60-second spacing in the data is a sum of such starts.

## Decisions

### D1. A per-tab minimum gap between turn-ended runs

The slot records `lastStart`, the time its last run started. A `turn-ended` request whose time is less than
`TAB_RECAP_RUN_DEBOUNCE_MS` after `lastStart` arms its timer for the deadline `lastStart + window` instead of the settle delay.
Later turn-ended requests inside the window keep that deadline and replace the timer's lanes, so the run that starts at the
deadline reads every turn the window collected.

The settle delay still applies to the first request of a burst. With a window of 60 000 ms, a burst runs once at most per
minute per tab, and the run reads the turns through the cursor, so no turn is missed.

*Built-ins.* `setTimeout` and `Date.now` through the existing `Clock` port; no timer library. The `lastStart` value is one
number per slot.

### D2. Explicit causes are never debounced

These requests start at once, as they do now, whatever `lastStart` is:

| Cause | Why it is not debounced |
|---|---|
| `focused` | the operator is looking at the tab, and waits for its recap |
| `requested` | another flow waits for it: autocompact's refresh (`refreshNow`), a compaction's refresh, an operator's request |
| the first run of a tab (no recap yet) | a tab with no recap has nothing to merge into |
| a run whose set of lanes changed (a lane was opened or closed) | the recap's structure changes, so it must be written now |
| the first run after a boundary (a compaction, a switch) | the curator reconciles then, and its input is the boundary's |

These are tested by cause, not by time, so a `requested` run during a window still starts at once and resets `lastStart`.

### D3. The default is 0, the recommended value is 60 000 ms, pending a replay

`TAB_RECAP_RUN_DEBOUNCE_MS` is `0` (today's behaviour) by default. The value is read on every request, so a change applies
without a restart. The accepted values are `0` and 5 000 to 300 000 ms; anything else falls back to `0`.

The recommended value is 60 000 ms: it covers the measured burst spacing (under 60 s) and is one minute of recap age at most.
It is not made the default until the replay (D5) keeps the EXP-001 bar.

*Why the default stays at 0.* The debounce changes when a recap is written, and the recall effect of merging turns has not
been measured. EXP-001 measured one run per turn. The operator's rule is that a default moves only when the data supports
it, so the mechanism ships first, switched off.

### D4. The trigger name does not change

A debounced run's trigger stays `turn-ended` in the event stream (`recap-written:turn-ended`), so consumers see no new trigger
name. No new column or view is proposed.

### D5. Measurement: merged turns in the replay

The replay (`tab-recap eval --replay <file> --pipeline one`) runs one writer call per turn. A `--merge-turns <n>` option
(new) groups consecutive turns into one call, the way a window merges them. The measurement is then:

- the EXP-001 corpus with `--merge-turns 1` (the control, equal to the R05/R10 setting) and `--merge-turns 2`, `3`, with the
  writer and judge pinned as in R10 (writer Claude Haiku 5.5 at medium, judge codex gpt-6-luna at medium);
- the same two runs repeated for the noise floor (R02/R03 showed coverage ±1, median 0, I4 ±1);
- the bar: state coverage within the floor of the control (78–83 %), read-back median not below the control's, I4 within
  the floor (87–93 %), 0 items dropped after the retry, and cost per turn at or below $0.0032.

A window of 60 000 ms is recommended only if a merge of the typical burst (two to three turns) passes the bar.

*Limit.* The EXP-001 corpus has 23 turns from one session, so the test is one session's worth of merging. A second session
from another operator is not available in the repository.

## Settings

| Key | Default | Range | Label |
|---|---|---|---|
| `TAB_RECAP_RUN_DEBOUNCE_MS` | 0 | 0 or 5 000 to 300 000 | needs a test first (recall with merged turns, D5); recommended 60 000 |

## Open questions for the operator

1. **The recommended value.** 60 000 ms covers the measured bursts. A 30 000 ms window merges fewer runs and keeps the recap
   fresher; the data cannot choose between them until the D5 replay runs.
2. **Recap age.** A debounced recap is up to one window older when the operator looks at it. Is one minute acceptable on the
   busiest orchestrator tabs?

## Verification

- **Unit (new).** Two `turn-ended` requests 20 s apart start one run at the window's end and read both turns (the cursor
  advances once); a `focused` request during the window starts at once and resets `lastStart`; a `requested` request starts
  at once; the first run of a tab starts at once; a lane-set change starts at once; `TAB_RECAP_RUN_DEBOUNCE_MS=0` starts
  every turn-ended request at the settle delay as today; an invalid value falls back to 0.
- **Unit (existing).** Every test of `recap-job` keeps its expectations with the default of 0.
- **Replay (D5).** The `--merge-turns` runs above, with the noise floor, reported in the MR with the run labels.
- **Live check.** With the window at 60 000 ms on one busy orchestrator tab for one hour: the count of `recap-written` events
  against the count of turn endings, and the writer's recorded spend for the hour, against the same hour before.

## Non-goals

- No change to the settle delay, the single-flight rule per tab, or the queued `again`.
- No change to which turns a run reads.
- No change to the writer's model or effort.
