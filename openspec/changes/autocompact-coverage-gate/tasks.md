# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Vocabulary

- [ ] 1.1 `CONTEXT.md`: add **Asked verdict** (the decider's verdict before a brief check turns it into `wait`), **Coverage
  backoff** (the hold on a lane after a failed check) and **Brief retention** (the 14-day keep of a checked brief). Verify:
  the `recap-vocabulary` lint passes.

## 2. Storage (design D2, D3)

- [ ] 2.1 `src/adapters/db/schema/014-coverage-evidence.ts`: `asked_verdict`, `coverage_ms`, `coverage_cost_micro_usd`,
  `brief`, `checked_facts`, `briefed_at` on `autocompact_decision`, all nullable. Register it in `schema/index.ts`. Verify: a
  test opens a database at `013` with rows, migrates to `014`, and reads every old row with `asked_verdict` null.
- [ ] 2.2 `ports/autocompact-records.ts` and `adapters/db/autocompact-records.ts`: `record` writes `asked_verdict`; `amend` also
  writes the check's time, cost, brief and checked facts; a new `clearBriefs(olderThan)` clears `brief` and `checked_facts`.
  Verify: `amend keeps the asked verdict when the check turns it into wait` (new test/autocompact-records.test.ts).
- [ ] 2.3 `application/input-retention.ts`: call `clearBriefs` with `TAB_RECAP_KEEP_BRIEF_DAYS` (default 14; 0 keeps none).
  Verify: `a checked brief is cleared after its retention` (test/retention.test.ts).
- [ ] 2.4 `bash ci/check-migrations.sh`: `010` to `013` unchanged. Verify: the script passes.

## 3. The ceiling is never blocked (design D1)

- [ ] 3.1 `application/compaction-coverage.ts`: `checkedBrief` gains the lane's gate; at the ceiling a failed or unchecked brief
  returns `waited: false` with the missing count in `why`. Verify: `a ceiling lane is compacted when the check fails` and
  `a ceiling without a decider types the operator's text` (new test/compaction-coverage.test.ts).
- [ ] 3.2 `application/compaction.ts`: pass the gate through `verified`; the decision's `why` carries the missing count at the
  ceiling. Verify: `a failed check at the ceiling records compact with gate ceiling` (test/compaction.test.ts).
- [ ] 3.3 Update the existing ceiling-blocked case, the one test that asserts the old behaviour, and say so in the MR.
  Verify: `bash ci/test.sh` passes.

## 4. The backoff gate (design D4)

- [ ] 4.1 `domain/autocompact.ts`: the `coverage-backoff` gate between `unchanged` and `in-flight`, below the ceiling only;
  `TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` read with the range rule (0 or 60 000 to 86 400 000, else 1 800 000). Verify:
  the five scenarios of "A failed brief check backs off below the ceiling" (new test/autocompact-skips.test.ts, the skip gates' file).
- [ ] 4.2 `application/autocompact.ts`: a `coverage` wait starts the backoff, read from the decision row's time and tokens.
  Verify: `a backoff holds a lane and releases it at ten percent growth` (test/autocompact-skips.test.ts).

## 5. Settings and listing

- [ ] 5.1 `application/autocompact-listing.ts`: show `asked` next to the verdict when it differs; `tab-recap autocompact` prints
  the backoff in its header. Verify: the listing test covers a row with `asked` `compact` and verdict `wait`.
- [ ] 5.2 `i18n/en.ts` and `i18n/es.ts`: the skip gate `coverage-backoff`, the header line, and the `why` text with the missing
  count. Verify: `bash ci/test.sh` passes, including the translation-completeness test.

## 6. Docs

- [ ] 6.1 `config.example.env` and `README.md` "Autocompact": the backoff, the ceiling rule, the two keys, and what a
  `coverage-backoff` skip means. Verify: `bash ci/lint.sh` passes.

## 7. Replay and live check (design: verification)

- [ ] 7.1 Live check on a daemon at this version: one lane at or above the ceiling with a failed check compacts once and logs
  the missing count; one lane below the ceiling skips with `coverage-backoff` for its window.
- [ ] 7.2 After seven days of stored briefs, replay the blocked checks offline and report how many a 30-minute backoff would
  have delayed past a compaction that happened. Record the result in the MR and move the backoff default only if the data
  supports it. Verify: the report is linked from the MR.

## 8. Archive

- [ ] 8.1 `openspec archive autocompact-coverage-gate` in this merge request, once every other task is checked and the gates
  pass. Do not archive before implementation: the delta spec describes behaviour that does not exist yet.
