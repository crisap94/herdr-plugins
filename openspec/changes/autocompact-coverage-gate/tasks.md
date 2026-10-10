# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [x] 1.1 `CONTEXT.md`: add **Asked verdict** (the decider's verdict before a brief check turns it into `wait`), **Coverage
  backoff** (the hold on a lane after a failed check), **Ceiling override** (a lane at the ceiling is compacted whatever the
  check says) and **Brief retention** (the 14-day keep of a checked brief). Verify: the `recap-vocabulary` lint passes.

## 2. Types (design: Types)

- [x] 2.1 `domain/autocompact.ts` and `config.ts`: `CoverageOutcome`, `UncheckedReason`, `CeilingPolicy`, `Backoff`,
  `BriefRetention`, branded `Milliseconds`, and `SKIP_GATES` as the one list the skip gate type derives from. Settings are
  parsed once at the edge; out-of-range values fall back to their defaults. Verify: `a typed setting outside its range falls
  back` (test/config.test.ts) and a compile-time exhaustive switch over `CoverageOutcome`.
- [x] 2.2 `CheckedFact` codec (`encode`, `decode`) used by the brief repository and nothing else. Verify: round trip
  `decode(encode(x)) == x` for zero, one and 40 facts (test/checked-fact-codec.test.ts), the only serializer test of the
  record.

## 3. Storage (design D2, D3)

- [x] 3.1 `src/adapters/db/schema/014-coverage-evidence.ts`, registered in `schema/index.ts`:
  1. drop both readable views, `autocompact_skip_readable` and `autocompact_decision_readable`: the skip view reads the table step 4
     replaces, and SQLite refuses the rename while a view reads it (`010` drops its views first for the same reason);
  2. `ALTER TABLE autocompact_decision ADD COLUMN` for `asked_verdict` (with its CHECK), `coverage_outcome` and `unchecked_reason`
     (each with its CHECK), `coverage_missing`, `coverage_ms`, `coverage_cost_micro_usd` (all nullable, each with its CHECK);
  3. `CREATE TABLE autocompact_brief (decision_id ... REFERENCES autocompact_decision(id) ON DELETE CASCADE, briefed_at INTEGER
     NOT NULL, body BLOB NOT NULL)` and its time index;
  4. rebuild `autocompact_skip` by the SQLite table-rebuild procedure (create new, copy rows, drop, rename), keeping its primary key,
     foreign key and `STRICT, WITHOUT ROWID`, with `coverage-backoff` added to the gate CHECK;
  5. recreate `autocompact_skip_readable`, and `autocompact_decision_readable` with the new columns and with `requested` (added by
     `011`) kept beside them.
  The gate CHECK literal is written once, in this migration. Before writing it, read `schema/010-autocompact.ts` and rebuild
  any other CHECK that must change the same way. The order is tested: run on a database built from the real `001`–`013` migrations,
  the listed order fails (`error in view autocompact_skip_readable: no such table: main.autocompact_skip`), and the order above
  passes (design, Verification). Verify: a test opens a database at `013` with rows, migrates to `014`,
  reads every old decision with `asked_verdict` null, keeps the old skip rows, accepts `coverage-backoff`, refuses a
  non-member gate, and reads both views (test/migration-014.test.ts).
- [x] 3.2 `ports/autocompact-records.ts` and `adapters/db/autocompact-records.ts`: `record` writes `asked_verdict`; `amend`
  takes a `CoverageOutcome` and writes `coverage_missing`, `coverage_ms` and the cost; `LastDecision` gains `gate`; lane keys
  are `TabId` and `PaneId`. New port `ports/autocompact-briefs.ts` with its repository: `put(decisionId, brief, appended,
  checked, briefedAt)` and `clearBefore(cutoff)`. Verify: `amend keeps the asked verdict when the check turns it into wait`
  (test/autocompact-records.test.ts).
- [x] 3.3 `application/input-retention.ts`: call `clearBefore` with the `BriefRetention` value (`none` deletes every brief
  row). The retention takes a second dependency, the brief repository, because it is typed to the run inputs only today.
  Verify: `a checked brief is cleared after its retention` (test/retention.test.ts).
- [x] 3.4 `bash ci/check-migrations.sh`: `010` to `013` unchanged. Verify: the script passes.

## 4. The ceiling is not blocked by the check (design D1)

- [x] 4.1 `application/compaction-coverage.ts`: `checkedBrief` returns a `CoverageOutcome` with the lane's gate. At the ceiling
  under `overrides-check`: the better of the two briefs is chosen (fewer missing; the rewrite on a tie; an unchecked rewrite loses
  to a checked first brief), and the missed goal, needs, decisions and rules facts are appended verbatim under a fixed heading,
  capped at 1 500 characters, in the order goal, rules, needs, decisions newest first, with the count left out in the heading.
  Verify: `a ceiling lane is compacted when the check fails`, `a rewrite that cannot be checked loses to the checked first brief`,
  `the appended block is capped and ordered` and `a ceiling without a decider types the operator's text` (new
  test/compaction-coverage.test.ts).
- [x] 4.2 `application/compaction.ts`: pass the gate through `verified`; the decision's `why` names the count and the path;
  one log line per ceiling case. Under `blocked-by-check` the ceiling behaves as below it. Verify: `a failed check at the
  ceiling records compact with gate ceiling` and `the switch off keeps the check at the ceiling` (test/compaction.test.ts).
- [x] 4.3 Update the existing ceiling-blocked case, the one test that asserts the old behaviour, and say so in the MR.
  Verify: `bash ci/test.sh` passes.

## 5. The backoff gate (design D4)

- [x] 5.1 `domain/autocompact.ts`: the `coverage-backoff` gate between `unchanged` and `in-flight`, below the ceiling only, read
  from `Backoff`. Verify: the scenarios of "A failed brief check backs off below the ceiling" (test/autocompact-skips.test.ts).
- [x] 5.2 `application/autocompact.ts`: the gate reads `LastDecision` (its `gate`, `at`, `tokens`) and `lastBreakAt`; the
  backoff is never written to the skip table as state, only the skip row for the gate. Verify: `a backoff holds a lane and
  releases it at ten percent growth` and `a backoff survives a restart` (test/autocompact-skips.test.ts).

## 6. Settings and listing

- [x] 6.1 `application/autocompact-listing.ts`: show `asked` next to the verdict when it differs; `tab-recap autocompact` prints
  the backoff and the ceiling policy in its header. Verify: the listing test covers a row with `asked` `compact` and verdict
  `wait`.
- [x] 6.2 `i18n/en.ts` and `i18n/es.ts`: the skip gate `coverage-backoff`, the header lines, the `why` text with the missing
  count, the ceiling log line. Verify: `bash ci/test.sh` passes, including the translation-completeness test.

## 7. Docs

- [x] 7.1 `config.example.env` and `README.md` "Autocompact": the ceiling override and its switch, the backoff (off by default),
  the brief retention, and what a `coverage-backoff` skip means. Verify: `bash ci/lint.sh` passes.

## 8. Replay and live check (design: verification)

- [ ] 8.1 Live check on a daemon at this version: one lane at or above the ceiling with a failed check compacts once and logs
  the missing count; with the switch `off`, the same lane waits. Verify: the log lines are in the MR.
- [ ] 8.2 After fourteen days of stored briefs, replay the blocked checks offline and report how many a 30-minute backoff would
  have delayed past a compaction that happened. Record the result in the MR. Move the backoff default to 30 minutes only in a
  separate MR, and only if the data supports it. Verify: the report is linked from the MR.

## 9. Archive

- [ ] 9.1 `openspec archive autocompact-coverage-gate` in this merge request, once every other task is checked and the gates
  pass. Do not archive before implementation: the delta spec describes behaviour that does not exist yet.
