# Design

## Evidence

From 32.3 hours of live data (816 recap runs, $3.83 of recorded writer spend), read from a copy of the tab-recap database
taken on 2026-10-10. Figures marked **reading** are interpretation.

| Fact | Count | Notes |
|---|---|---|
| Runs starting less than 60 s after the previous run on the same tab | 223 of 816 (27 %) | |
| Their spend | $1.21 (32 % of recorded writer spend) | an upper bound on a window's saving, not the saving |
| Concentration | 95, 27 and 24 runs on the three orchestrator tabs with the most bursts | the three orchestrator tabs |
| Run rate, 10-09 against 10-10 | 273 runs in 24 h (11.4 per hour) against 498 in 4.15 h (120 per hour) | about 10× |
| Cost per run, 10-09 against 10-10 | $0.0030 against $0.0057 | 1.9×; the input-size part is addressed by the ledger-pruning change |
| EXP-001 bar, cost per turn (R10) | $0.0032 | the bar is per turn, so merged runs must be compared per turn of text read |

**Reading.** A burst run reads the turns that arrived since the previous run through the cursor, so its input is small in
turns but carries the whole ledger. Merging a burst into one run saves the ledger's per-run input for every merged run. The
saving is at most the cost of the runs a window merges into a neighbour. The data cannot say how many runs a given window
merges, because the window is not in use yet; the replay in D5 measures it.

## Current code

`RecapJob.request(tab, lanes, cause)` (`src/recap/application/recap-job.ts`) keeps one `Slot` per tab:

- a `turn-ended` request arms a timer of `TURN_SETTLE_MS` (2 500 ms); another request for the same tab clears the timer and
  arms it again with the newer lanes, so a burst already merges while the timer is pending;
- a `focused` or `requested` request arms a timer of 0;
- while a run is in progress, a new request is kept as `again` and runs when the first finishes. On main a later request overwrites `again`. With a run window on, `again` keeps the strongest cause: a forced cause (`focused`, `requested`) is never replaced by `turn-ended`, and between two causes of the same strength the newer one replaces the older. With the window at 0 the overwrite stays.

What is missing is a floor between the start of one run and the start of the next. Runs are single-flight, so the gap
between two runs of a tab is the first run's duration plus the settle delay. The report puts a run at a median of 13.9 s
and a 90th percentile of 26 s, so a burst that spans more than the settle delay produces a run about every 16 to 30 seconds
at worst, not one every 2.5 seconds. The 60-second spacing in the data is a sum of such starts.

## Decisions

### D1. A per-tab minimum gap between turn-ended runs

The slot records `lastStart`, the start of the last run that called the writer, and `lastLanes`, the lane set of that run (a set of `PaneId`). A `turn-ended` request whose time is less than the window after `lastStart` arms its timer for `max(lastStart + window, now + 2 500 ms)`, not for the settle delay alone. The settle term is a floor on the deadline: a turn that ends a second before the window closes still waits the settle delay, because its transcript may still be flushing. Each later turn-ended request inside the window re-arms the same timer with the same rule and its own lanes, so the run that starts reads every turn the window collected. A turn-ended request that arrives while a run is in progress is kept as `again` and starts when that run ends, or at its own deadline if that is later.

The settle delay still applies to the first request of a burst. With a window of 60 000 ms, a burst runs once at most per
minute per tab (plus the run's own duration, since runs are single-flight), and the run reads the turns through the cursor,
so no turn is missed.

*Built-ins.* `setTimeout` and `Date.now` through the existing `Clock` port; no timer library. The slot holds two values,
`lastStart` and `lastLanes`.

### D2. Causes that start at once, and the data each one uses

These requests start at once, as they do now, whatever `lastStart` is; while a run of the tab is in progress they run as its `again`, as they do now. Each condition reads data the job already has:

| Condition | Data | Why it is not debounced |
|---|---|---|
| `focused` cause | the request's cause | the operator is looking at the tab, and waits for its recap |
| `requested` cause | the request's cause | another flow waits for it: autocompact's refresh (`refreshNow`), a compaction's refresh, an operator's request |
| the tab's first run in this daemon | the slot has no `lastStart` | a tab with nothing merged yet has nothing to merge into; after a restart the first turn-ended run is forced too |
| a run whose set of lanes changed | the request's lanes against `slot.lastLanes` | the recap's structure changes, so it must be written now |

Every run that calls the writer sets `lastStart` and `lastLanes`, forced or not, so the next turn ending is measured from it. A forced run that finds no new turn returns before the writer and sets neither, so flipping focus between two tabs cannot push a real turn ending back.

*Not a condition: "the first run after a boundary".* Its data does not exist: `RecapCause` is
`turn-ended | focused | requested` (`domain/intent.ts`), and a compaction's refresh already arrives as `requested`, so it is
forced by the row above. A session switch is not a cause the job sees today. A boundary cause would be a separate change
and is out of scope.

These conditions are tested by their data, not by time, so a `requested` run during a window still starts at once and
sets `lastStart` when it calls the writer.

### D3. The default is 0, the recommended value is 60 000 ms, pending a replay

`TAB_RECAP_RUN_DEBOUNCE_MS` is `0` (today's behaviour) by default. It is read on every request, so a change applies without
a restart. The config edge parses it once into a typed value, `Debounce = off | window(Duration)`, with the accepted
values `0` (off) and the whole numbers from 5 000 to 300 000 ms; anything else is `off`. `Duration` is the plugin's existing
branded time value, so a raw number never reaches the job.

The recommended value is 60 000 ms: it covers the measured burst spacing (under 60 s) and is one minute of recap age at
most. It is not made the default until the replay (D5) keeps the EXP-001 bar.

*Why the default stays at 0.* The debounce changes when a recap is written, and the recall effect of merging turns has not
been measured. EXP-001 measured one run per turn. The operator's rule is that a default moves only when the data supports
it, so the mechanism ships first, switched off.

### D4. The trigger name does not change

A debounced run's trigger stays `turn-ended` in the event stream (`recap-written:turn-ended`), so consumers see no new trigger
name. No new column or view is proposed.

### D5. Measurement: merged turns in the replay

The replay (`tab-recap eval --replay <file> --pipeline one`) runs one writer call per turn. A `--merge-turns <n>` option
(new) groups consecutive turns into one call, the way a window merges them within one session. The measurement is then:

- the EXP-001 corpus with `--merge-turns 1` (the control, the R10 setting) and `--merge-turns 2` and `3`, with the writer and
  judge pinned as in R10 (writer Claude Haiku 5.5 at medium, judge codex gpt-6-luna at medium);
- the control run twice (A and B), and each merged setting run twice, so the noise floor is measured on this writer. The
  README's R02 and R03 floor was measured on another writer and is not used;
- the floor is `max(1 point, |control A − control B|)` on state coverage and on I4 supported. A difference inside the floor is
  no difference;
- the bar, against the control's own numbers (the mean of runs A and B):
  - state coverage no more than the floor below the control's;
  - I4 supported no more than the floor below the control's;
  - read-back median not below the control's;
  - 0 items dropped after the retry;
  - cost per turn of text read at or below $0.0032.

A window of 60 000 ms is recommended only if a merge of the typical burst (two to three turns) passes this bar.

*Limit.* The EXP-001 corpus has 23 turns from one session. The replay merges consecutive turns of one session, so it cannot
show merging across lanes: an orchestrator's burst comes from several lanes (child events), and that case is not measured.
A second session from another operator is not available in the repository.

*Private corpus.* The corpus and raw outputs stay on the private branch (`REMOVED-ON-MAIN.txt`). The replay runs there; only
the metrics table and the run labels are committed, in `experiments/` at the repository root.

## Settings

| Key | Default | Range | Label |
|---|---|---|---|
| `TAB_RECAP_RUN_DEBOUNCE_MS` | 0 | 0 or 5 000 to 300 000 | needs a test first (recall with merged turns, D5); recommended 60 000 |

## Risks

- **A run lost to a restart or a tab close.** A pending debounced run lives in memory. A restart, or the tab closing, inside a
  window drops it, and the recap stays stale until the next event on that tab. The cursor is not lost, because the next run
  reads through it. Only the last turn of a burst is affected. The report counts 6 restarts in 32 hours. This risk is
  accepted. A startup catch-up (one run per tab with unread turns at boot) is a follow-up.
- **Recap age.** A debounced recap is up to one window older when the operator looks at it (open question 2).
- **Merged turns across lanes.** Not measured by the replay (D5).
- **A lane set that changes often.** A request whose lane set differs from the last run's is forced (D2). On a tab whose child panes come and go, most requests are forced and the window does nothing there. The replay does not measure this; the live check (task 6.1) should say how many runs were forced, and why.

## Open questions for the operator

1. **The recommended value.** 60 000 ms covers the measured bursts. A 30 000 ms window merges fewer runs and keeps the recap
   fresher; the data cannot choose between them until the D5 replay runs.
2. **Recap age.** A debounced recap is up to one window older when the operator looks at it. Is one minute acceptable on the
   busiest orchestrator tabs?
3. **A boundary cause.** Should a session switch get its own cause, so that it can be forced explicitly? Today it is not a
   cause the job sees, so it is debounced like any turn ending. Accepting that is the default here.

## Verification

- **Unit (new).** Two `turn-ended` requests 20 s apart start one run at the window's end and read both turns (the cursor advances once); a turn ending at 59 s, with the last run at 0, starts at 61.5 s; a `focused` or `requested` request during the window starts at once and clears the pending timer (one timer per slot); with a window on, a `requested` request kept as `again` is not replaced by a later `turn-ended`, and runs when the run in progress ends; a request that finds no new turn sets neither `lastStart` nor `lastLanes`; a request with a changed lane set starts at once; with the window at 0 every turn-ended request starts at the settle delay as today; an invalid value is `off`; after a restart the first turn-ended run starts at once.
- **Typed.** `Debounce` is parsed once at the edge; the job takes only the parsed value (a test passes a raw number and fails
  to compile, or the config test covers each out-of-range value).
- **Unit (existing).** Every test of `recap-job` keeps its expectations with the default of 0.
- **Replay (D5).** The `--merge-turns` runs above, with the noise floor, reported in the MR with the run labels.
- **Live check.** With the window at 60 000 ms on one busy orchestrator tab for one hour: the count of `recap-written` events
  against the count of turn endings, and the writer's recorded spend for the hour, against the same hour before.

## Non-goals

- No change to the settle delay or the single-flight rule per tab. The queued `again` keeps its one slot; only its cause rule changes (D1).
- No change to which turns a run reads.
- No change to the writer's model or effort.
- No boundary cause.
