# Design

## Evidence

All figures are from 32.3 hours of live data (202 decisions, 67 compactions, 816 recap runs), read from a copy of the
tab-recap database taken on 2026-10-10. Figures marked **reading** are interpretation.

| Fact | Count | Source |
|---|---|---|
| Compact verdicts | 40 (37 asked, 3 at the ceiling) | decisions, verdict `compact` |
| Compacted automatically | 20 | compactions, origin `auto` |
| Blocked by the check (`coverage`) | 19 | decisions, gate `coverage` |
| Passed the check at 5 or fewer blocking facts | 17 of 18 | check answers |
| Passed the check at 15 or more blocking facts | 0 of 12 | check answers |
| Briefs written for 20 compactions | 72 (32 failed the first check, 13 rescued by the rewrite, 19 still failed, 8 passed first) | check log lines |
| Time in blocked flows | 19 flows, median 76 s each, 23.5 min in all | compaction trails |
| Ceiling compactions | 2 (84 %, 82 %); 1 ceiling lane blocked by the check (75 %, under `eager`) | decisions |

**Reading.** The check fails structurally at large ledgers. Its inputs are up to 40 facts plus their reasons, in a brief of at
most 3 000 characters, which leaves about 75 characters per fact. Lowering the pass mark does not fix this (at `eager`'s 0.60
it would pass 3 of the 19 blocked flows), so the fix is in what the check checks, which is the follow-up change. This change
removes the two faults that do not depend on that: the ceiling being blocked, and the loss of the verdict.

## Decisions

### D1. A lane at or above the ceiling is never blocked by the check

`checkedBrief` keeps its shape. For a lane whose gate is `ceiling`, a failed check after the one rewrite does not wait. The
flow types the brief the writer produced last (the rewrite if one ran), and when the writer produced no text it types the
text an operator's compaction would get. The decision keeps gate `ceiling` and verdict `compact`. The check's answers, time
and the count of facts it missed are still recorded, in the decision's `why`, so the outcome can be labelled later.

*Why.* A ceiling exists because the context is too full to keep working safely. A check that cannot pass at large ledgers
(0 of 12 at 15 or more blocking facts) holds such a lane indefinitely; the in-flight gate, which is checked first, and the
one-at-a-time lock already hold lanes for hours, and the check should not add a second gate that ignores the ceiling.

*Alternative rejected.* Lowering the ceiling's own check to a smaller pass mark only at the ceiling. It keeps a model judgement
between a full context and its compaction, for no measured gain: the 2 ceiling compactions in the data were not affected by
the check. The one blocked ceiling lane (75 % under `eager`, whose ceiling is 65) is too few to show anything either way, and a
lower pass mark passes only 3 of the 19 blocked flows, so the rule does not depend on the pass mark.

*Built-ins.* None needed; this is a branch in existing code.

### D2. The asked verdict is kept, and the effective verdict is unchanged for every reader

Migration `014` adds `asked_verdict TEXT` to `autocompact_decision`. `record` writes the decider's verdict into it when the
decision is made. `amend` still writes `verdict = 'wait'`, `gate = 'coverage'` and `why` for a blocked flow, so
`tab-recap autocompact`, the expanded view's counts and the compaction listing read the same values as before.

Rows written before `014` have `asked_verdict` null. Readers treat null as "not recorded", never as `compact`.

*Why a new column rather than a second table.* The row is already the decision; the check amends it. A second table would
need a join for every listing.

*Built-ins.* SQLite `ALTER TABLE ... ADD COLUMN` in a new numbered migration; no hand-written storage code.

### D3. The check's evidence is kept

Migration `014` also adds, to the same row:

- `coverage_ms INTEGER`: the wall time of the check, both checks when the rewrite ran (the decider's time, summed);
- `coverage_cost_micro_usd INTEGER`: the cost the decider reports, null when it reports none (the Jev path reports none
  today, so the column is null until the decider reports one);
- `brief TEXT`: the text of the last brief checked, at most 3 000 characters;
- `checked_facts TEXT`: a JSON array of `{ section, text, why }` for each fact the check was asked about, in the order
  `keeps_<i>` and `reason_<i>` use;
- `briefed_at INTEGER`: when the brief was written.

`brief` and `checked_facts` are cleared 14 days after `briefed_at` (`TAB_RECAP_KEEP_BRIEF_DAYS`, default 14, 0 keeps none).
The clearing runs inside the existing input retention (`src/recap/application/input-retention.ts`), so no new timer is added.

*Why.* A replay of the check under a different scope needs the brief text and the fact texts exactly as they were checked,
because the latest text of a fact can differ from the text that was checked (the state shows a fact's latest wording). The
report found that none of this was stored, so the 40 stored answer sets can only be scored, not replayed.

*Storage.* At 3 000 characters for `brief` and about 6 KB for `checked_facts` at 40 facts, one decision costs about 9 KB.
At the measured rate of about 100 decisions a day (96 decisions in the 4 hours to 04:09 on 10-10, 91 on 10-09), 14 days is
about 13 MB.

*Built-ins.* `JSON.stringify` and the existing SQLite writer.

### D4. A failed check backs off for 30 minutes

After a `coverage` wait for a lane, a lane below the ceiling is skipped with gate `coverage-backoff` for
`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` (default 1 800 000 ms; 0 turns it off; a value outside 0 and 60 000 to 86 400 000
falls back to the default). The gate sits after `unchanged` and before `in-flight`, so no decider is asked and no brief is
written during the backoff. A backoff ends at its time, or when the lane's tokens grow by more than 10 % of the window,
whichever is first.

*Why.* The same lanes failed the check four and five times each. Each failure cost a decider call, a brief and a check
(a median of 76 s of writer time per blocked flow). The `unchanged` gate already holds a lane at the same tokens; this gate
also holds it while the tokens creep up, which is what happened on the lanes that failed most.

*Risk.* A backoff can delay a compaction that a retry would have passed. The stored answers do not show whether a retry within
30 minutes would have passed: 8 of 40 checks passed at the first try, and the stored data does not link each retry to its
lane's next state. The replay in the verification section measures this. Until then the default is 30 minutes and the
operator can set 0.

*Built-ins.* None needed; the gate is a timestamp per lane in the existing skip table.

## Settings

| Key | Default | Range | Label |
|---|---|---|---|
| `TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` | 1 800 000 | 0 or 60 000 to 86 400 000 | needs a test first (the backoff's cost to a compaction) |
| `TAB_RECAP_KEEP_BRIEF_DAYS` | 14 | 0 to 60 | safe (storage only) |

Two behaviours change by default: the ceiling rule (D1, a rule, not a setting) and the backoff (D4, on at 30 minutes). Both
are the smallest changes the data supports, and the backoff is the one the operator should confirm. The check's scope, pass
mark and decider stay as they are.

## Open questions for the operator

1. **Ceiling rewrite.** D1 keeps the one rewrite at the ceiling, which costs one more brief per ceiling lane. Should the
   rewrite be skipped there, saving a brief but typing the first version?
2. **Backoff default.** The default is 30 minutes. A replay can show whether any repeat check passed later within the
   window; until then the value is a guess the operator should confirm.
3. **Follow-up change.** The scope change (`TAB_RECAP_AUTOCOMPACT_COVERAGE_FACTS`, the newest decisions and the goal and rules
   facts only) is a separate change. It needs the stored briefs from D3 to be replayed, which means 14 days of data before it
   can be measured.

## Verification

- **Unit (new).** Ceiling with a failed check types the brief and records `compact`, gate `ceiling`, `asked_verdict` `compact`;
  ceiling with no brief text types the operator's text; a non-ceiling failed check records `wait`, gate `coverage` and keeps
  `asked_verdict`; a decider that cannot answer at the ceiling still compacts and records `coverage` null; the backoff skips a
  lane for its window and releases it at 10 % token growth; the backoff set to 0 never skips.
- **Unit (existing).** Every test of `autocompact-gates`, `compaction-coverage` and the one-compaction-per-lane suite keeps its
  expectations, except the ceiling-blocked case, which changes by D1.
- **Migration.** `014` adds the columns, leaves every existing row readable, and `ci/check-migrations.sh` passes with `010` to
  `013` unchanged.
- **Replay (after the change ships, on a live copy).** After 7 days of stored briefs, replay every blocked check and every
  backoff-skipped lane offline with the same decider, and report the number of checks that a 30-minute backoff would have
  delayed past a compaction that did happen. This is the measurement that moves the backoff default.
- **Live check.** Daemon restart with the change on; one ceiling lane at or above 80 % with a failed check compacts once and
  logs the check's failure with its missing count.

## Non-goals

- No change to the decider's questions, its style numbers, the default ceiling or minimum.
- No change to the brief writer.
- No change to the operator's compaction flow.
