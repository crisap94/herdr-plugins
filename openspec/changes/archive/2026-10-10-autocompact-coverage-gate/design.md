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
| Ceiling compactions | 2 (84 %, 82 %) | decisions |
| Ceiling lanes held by the check | 1 lane, 75 % (under `eager`), held through three brief rounds; logged again at 85 % (log only) | decisions, check log |

**Reading.** The check fails structurally at large ledgers. Its inputs are up to 40 facts plus their reasons, in a brief of
at most 3 000 characters, which leaves about 75 characters per fact. Lowering the pass mark does not fix this (at
`eager`'s 0.60 it would pass 3 of the 19 blocked flows), so the fix is in what the check checks, which is the follow-up
change. This change removes the two faults that do not depend on that: the ceiling being blocked, and the loss of the
verdict.

## Decisions

### D1. A lane at or above the ceiling is not blocked by the check (switchable, on by default)

`checkedBrief` returns a typed `CoverageOutcome` (see Types), not a boolean with a message:

- `passed`: every checked fact is kept;
- `missed{facts}`: the facts the brief drops, after the one rewrite;
- `unchecked{reason}`: no decider, the decider cannot answer, or no brief was written.

For a lane whose gate is `ceiling`, under `CeilingPolicy = overrides-check` (the default), a `missed` or `unchecked` outcome
does not wait. The flow types one brief, chosen in this order:

1. a brief whose check missed facts is compared with its rewrite: the one that misses fewer facts is typed, and the rewrite on a
   tie. A brief whose check could not answer has no count, so it is never preferred over a checked one; when the rewrite is
   unchecked, the first brief is typed, because its missed facts are known. A first brief whose check could not answer is
   typed as it is, with outcome `unchecked`;
2. if the typed brief's check missed facts, the missed goal, needs, decisions and rules facts are appended to it, with no model
   call, under a fixed heading, on the same line: `(1) goal: …; (2) rules: …`. The block is one line because a Claude lane's
   text is typed by the herdr adapter, which refuses any line break (a typed line has none). So each fact's text and reason
   have their whitespace collapsed; the wording is otherwise kept. The appended block is at most 1 500 characters, in the
   order goal, rules, needs, then decisions newest first (by last seen); a fact that does not fit is left out, and the heading
   says how many were left out. This keeps a rule such as "never force-push" from being lost silently;
3. if no brief text exists (no decider, or nothing written), the text an operator's compaction is given is typed, and nothing is
   appended, because no check named a missed fact.

The decision keeps gate `ceiling` and verdict `compact`. Its `asked_verdict` is the verdict the decider asked for; at gate
`ceiling` no verdict is asked, so it is `compact`, the verdict the ceiling gives. Its `coverage_outcome` is `missed` (with
`coverage_missing`, the count the typed brief missed) or `unchecked` (with `unchecked_reason`, and `coverage_missing` null).
Its `why` names the count and the path ("2 facts missed; missed facts appended", or "no brief: operator's text typed"). Every
such case writes one log line, so a ceiling compaction that went unchecked is visible, not silent.

Under `CeilingPolicy = blocked-by-check` (`TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK=off`), a lane at the ceiling
behaves as a lane below it: a failed check records `wait` with gate `coverage`, as today.

*Why.* A ceiling exists because the context is too full to keep working safely. A check that cannot pass at large ledgers
(0 of 12 at 15 or more blocking facts) holds such a lane indefinitely. The in-flight gate, which is checked first, and the
one-at-a-time lock already hold lanes for hours; the check should not add a second gate that ignores the ceiling.

*Operator override, recorded.* The report labels "never block at the ceiling" as proposed code, not as a tested change. It
is shipped on because the stored data points one way: 0 of 12 checks passed at 15 or more facts, and the one held ceiling
lane was held through three brief rounds. The switch is the rollback. The operator decides whether `on` ships (open
question 1).

*Alternative rejected.* Lowering the ceiling's own check to a smaller pass mark only at the ceiling. It keeps a model
judgement between a full context and its compaction, for no measured gain: the 2 ceiling compactions in the data were not
affected by the check. A lower pass mark passes only 3 of the 19 blocked flows, so the rule does not depend on the pass
mark.

*Built-ins.* A branch in existing code, and the `CeilingPolicy` value parsed once in `config.ts`.

### D2. The asked verdict is kept, and the effective verdict is unchanged for every reader

Migration `014` adds `asked_verdict TEXT` to `autocompact_decision`, with `CHECK (asked_verdict IS NULL OR asked_verdict IN
('compact','wait','undecided','unknown'))`, the same list as `verdict`. `record` writes the decider's verdict into it when
the decision is made. `amend` takes the `CoverageOutcome` and still writes `verdict = 'wait'`, `gate = 'coverage'` and the
`why` for a blocked flow, so `tab-recap autocompact`, the expanded view's counts and the compaction listing read the same
values as before.

Rows written before `014` have `asked_verdict` null. Readers treat null as "not recorded", never as `compact`.

*Why a new column rather than a second table.* The row is already the decision; the check amends it. A second table would
need a join for every listing.

*Built-ins.* SQLite `ALTER TABLE ... ADD COLUMN` in a new numbered migration; no hand-written storage code.

### D3. The check's evidence is kept

Migration `014` adds to `autocompact_decision`, all nullable:

- `coverage_missing INTEGER CHECK (>= 0)`: the count of facts the typed brief missed (null when unchecked or passed
  without facts); it is the number `why` names;
- `coverage_ms INTEGER CHECK (>= 0)`: the wall time of the check, both checks when the rewrite ran (summed);
- `coverage_cost_micro_usd INTEGER CHECK (>= 0)`: the cost the decider reports, null when it reports none (the Jev path
  reports none today).

The brief text and the checked facts go in a new table, not in the decision row, so the decision row stays small and
every scan of decisions stays light:

- `autocompact_brief (decision_id, briefed_at, body)`: `decision_id` is the decision's id, its primary key (one brief per decision),
  with `ON DELETE CASCADE`;
  `briefed_at INTEGER NOT NULL` is when the brief was written; `body BLOB NOT NULL` is the gzip of the record `{ brief: string (the writer's text, at most 3 000 characters), appended: number[] (the indexes in
  `checked` of the facts appended to the typed text), checked: CheckedFact[] }`, written and read only through one codec (see
  Types), as `run_input` is stored. The appended block is not stored as text: the function that typed it rebuilds it from
  `checked` and `appended`.

`CheckedFact = { section, text, why }`, in the order `keeps_<i>` and `reason_<i>` use. The text is the fact's text as it was
checked, because the latest wording of a fact can differ from the checked wording.

Rows are deleted, not updated, when they age out: `DELETE FROM autocompact_brief WHERE briefed_at < ?` for
`TAB_RECAP_KEEP_BRIEF_DAYS` (default 14; `0` keeps none). The clearing runs inside the existing input retention
(`src/recap/application/input-retention.ts`), which today depends on the run inputs only, so it gets a second dependency;
no new timer is added.

*Why.* A replay of the check under a different scope needs the brief text and the fact texts exactly as they were checked.
The report found that none of this was stored, so the 40 stored answer sets can only be scored, not replayed.

*Storage.* At 3 000 characters for the brief and about 6 KB for the checked facts at 40 facts, one brief is about 9 KB
before compression. At the measured rate of about 100 decisions a day (96 decisions in the 4 hours to 04:09 on 10-10, 91
on 10-09), 14 days is about 13 MB uncompressed, less after gzip, and the decision rows do not grow.

*Built-ins.* The existing SQLite writer and `zlib`, the same as `run_input`.

### D4. A failed check backs off, read from the decision row, and off by default

After a `coverage` wait, a lane below the ceiling is skipped with gate `coverage-backoff` for
`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS`. The default is `0`, which is off, until the replay in task 8.2 shows what a
window would delay. A value that is neither `0` nor 60 000 to 86 400 000 ms falls back to the default.

The backoff is **derived from the decision row, not stored in the skip table**. The skip table holds one row per lane,
replaced at every skip and deleted when the lane gets a decision (`ON CONFLICT ... DO UPDATE SET at = excluded.at`, and
`dropSkip` in `record`), so a backoff start written there would be overwritten by the next skip. The skip row records only
that the gate stopped the lane, the same as every other skip gate.

The backoff holds while all of these hold, read from the lane's last decision (`LastDecision`, which gains `gate`, so the
port can say "the last decision was a `coverage` wait" without a second query):

- the last decision's gate is `coverage` and its verdict is `wait`;
- the window has not passed since the decision's `at`;
- the lane's tokens have not grown by more than 10 % of its window since the decision's `tokens`;
- no boundary (`lastBreakAt`) came after the decision.

Each of these ends the backoff. Because the state is the decision row, a daemon restart neither drops the backoff nor
restarts it. The gate sits after `unchanged` and before `in-flight`, and it applies only below the ceiling. A lane that
reaches the ceiling is not held by the backoff; the in-flight gate, which comes before the ceiling, still applies, as it
does today.

*Why.* The same lanes failed the check four and five times each. Each failure cost a decider call, a brief and a check (a
median of 76 s of writer time per blocked flow). The `unchanged` gate already holds a lane at the same tokens; this gate
also holds it while the tokens creep up, which is what happened on the lanes that failed most.

*Risk.* A backoff can delay a compaction that a retry would have passed. The stored answers do not show whether a retry
within 30 minutes would have passed: 8 of 40 checks passed at the first try, and the stored data does not link each retry
to its lane's next state. That is why the default is off. The replay in task 8.2 measures it.

*Built-ins.* None needed; the gate reads `LastDecision` and the typed `Backoff` value.

## Types

These are the typed values the change introduces. Each is built once at the edge and the core never sees a raw string for
them (the typing rule of this plugin, stated here: a value with a fixed set of cases is a sum type, and a setting or an identifier is
parsed once at the edge into a typed value; the core takes no raw string or number for them. A check never returns a boolean with
a message, and an absent value is never a sentinel: null means not recorded, not a case).

- `CoverageOutcome = passed | missed{facts: CheckedFact[]} | unchecked{reason: UncheckedReason}`, handled exhaustively. It is stored
  as `coverage_outcome` and `unchecked_reason` (migration 014), each with a CHECK; the pairing (`unchecked_reason` set exactly when
  the outcome is `unchecked`) is written by the one function that stores an outcome, and a test covers it. The
  boolean-plus-message `Checked { waited, why }` and `amend(id, coverage, waited, why)` are replaced by it.
- `UncheckedReason = no-decider | decider-cannot-answer | no-brief`. `decider-cannot-answer` covers a failed call and an answer
  the check cannot read: both are one case in `checkedBrief` (`result.unknown`), so there is no second member for them.
- `CeilingPolicy = overrides-check | blocked-by-check`, parsed from `TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK` (`on`
  or `off`; anything else is the default, `overrides-check`).
- `Backoff = off | window(Milliseconds)`, parsed from `TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS`, with the range rule in the
  parser.
- `BriefRetention = none | days(n)`, with `n` in 1 to 60, parsed from `TAB_RECAP_KEEP_BRIEF_DAYS`; `0` is `none`.
- `Milliseconds` is a branded number; `TabId` and `PaneId` are the existing brands, used for the lane key in the records
  port (no bare `string`).
- `SKIP_GATES` is one constant list; the skip gate type is derived from it. The migration's CHECK literal is written once,
  and a test inserts each member and one non-member to prove the table agrees with the list (no string-assembled SQL).
- `CheckedFact = { section: FactSection, text: string, why: string | null }`, the existing section type; `CheckedFact` has one codec, `encode` and `decode`, used by the brief repository. The round trip
  `decode(encode(x)) == x` is tested once, including zero facts and 40 facts.

## Settings

| Key | Default | Range | Label |
|---|---|---|---|
| `TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK` | `on` | `on`, `off` | data supports it; operator confirms (open question 1) |
| `TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` | `0` (off) | `0` or 60 000 to 86 400 000 | needs a test first (task 8.2 decides the default) |
| `TAB_RECAP_KEEP_BRIEF_DAYS` | 14 | 0 to 60 | safe (storage only) |

One behaviour changes by default: the ceiling override (D1), and it is switchable. The backoff is off by default and moves
to 30 minutes only if the replay supports it. This follows the rule the spec applies to the other changes: a setting
labelled "needs a test first" ships off.

## Open questions for the operator

1. **Ceiling override, default.** D1 ships `on` (the check does not block the ceiling). The 0-of-12 result and the held lane
   support it, but the item is labelled as proposed, not tested. Keep `on`, or ship `off` until the replay? The switch makes
   either a one-line change.
2. **Ceiling rewrite.** D1 keeps the one rewrite at the ceiling, which costs one more brief per ceiling lane. Should the
   rewrite be skipped there, saving a brief but typing the first version?
3. **Backoff default.** The default is off. Task 8.2 shows whether a 30-minute window would have delayed a compaction that
   happened; only then should the value move.
4. **Follow-up change.** The scope change (`TAB_RECAP_AUTOCOMPACT_COVERAGE_FACTS`, the newest decisions and the goal and
   rules facts only) is a separate change. It needs the stored briefs from D3 to be replayed, which means 14 days of data
   before it can be measured.

## Verification

- **Unit (new).**
  - Ceiling, check `missed`, policy `overrides-check`: types the better brief with the missed facts appended verbatim, and
    records `compact`, gate `ceiling`, `asked_verdict` `compact`, `coverage_missing` = the count, and a `why` that names it.
  - Ceiling, check `missed`, policy `blocked-by-check`: records `wait` with gate `coverage` and keeps `asked_verdict`.
  - Ceiling, no brief text: types the operator's text, records `compact`, gate `ceiling`, `coverage_missing` null, and writes
    the log line.
  - Ceiling, decider cannot answer: compacts with the first brief, records `unchecked{decider-cannot-answer}`, and writes the log line.
  - Ceiling, the rewrite cannot be checked: types the first brief with its missed facts appended, records outcome `missed` with that count.
  - Better-of-two: the rewrite is typed when it misses fewer facts, the first brief when it misses fewer, the rewrite on a tie; an
    unchecked rewrite never wins; the appended block is capped at 1 500 characters and ordered goal, rules, needs, decisions.
  - Non-ceiling, failed check: records `wait`, gate `coverage`, keeps `asked_verdict`, keeps the brief.
  - Backoff holds a lane below the ceiling for its window and releases it at 10 % token growth; a boundary after the decision
    releases it; the backoff set to `0` never skips; a lane that reaches the ceiling is not held by the backoff.
  - Backoff survives a restart: a fresh daemon reading the decision row holds the lane.
- **Unit (existing).** Every test of `autocompact-gates`, `compaction-coverage` and the one-compaction-per-lane suite keeps its
  expectations, except the ceiling-blocked case, which changes by D1 and is named in the MR.
- **Typed.** The `CoverageOutcome` switch is exhaustive (the compiler rejects a missing case). The `CheckedFact` codec round
  trip passes for zero, one and 40 facts. `SKIP_GATES` matches the table's CHECK (insert each member, refuse a non-member).
  Each typed setting falls back to its default outside its range.
- **Migration.** `014` adds the columns and the brief table, rebuilds `autocompact_skip` with `coverage-backoff` in its CHECK, and
  recreates both readable views. The order is the one in task 3.1. Run on a copy of a database built from the real `001`–`013`
  migrations (`node:sqlite`, the repository's own runner, `foreign_keys` off, `foreign_key_check` before commit), the order as first
  listed fails at the table rename: `error in view autocompact_skip_readable: no such table: main.autocompact_skip`. The order in
  task 3.1 (both views dropped first) gives:

  > before: user_version=13
  > migrated: user_version=14
  > decision rows read via view: 1 (asked_verdict null: 1)
  > skip rows kept: 1, read via view: 1
  > coverage-backoff accepted
  > non-member gate refused
  > foreign_key_check rows: 0
  > integrity_check: ok

  A row written at `013` reads back with `asked_verdict` null, the old skip row survives, and `coverage-backoff` is accepted. A database at `013` with rows migrates: every old row reads, `asked_verdict` is
  null on them, old skip rows survive the rebuild, and `coverage-backoff` is accepted. `ci/check-migrations.sh` passes with
  `010` to `013` unchanged.
- **Replay (after the change ships, on a live copy).** After 14 days of stored briefs (the retention in D3), replay every blocked check and every
  backoff-skipped lane offline with the same decider, and report the number of checks that a 30-minute backoff would have
  delayed past a compaction that did happen. This is the measurement that moves the backoff default. The replay corpus stays
  on the private branch; only the metrics and run labels are committed.
- **Live check.** Daemon restart with the change on; one ceiling lane at or above 80 % with a failed check compacts once and
  logs the check's failure with its missing count.

## Non-goals

- No change to the decider's questions, its style numbers, the default ceiling or minimum.
- No change to the brief writer.
- No change to the operator's compaction flow.
- No change to the in-flight gate.
