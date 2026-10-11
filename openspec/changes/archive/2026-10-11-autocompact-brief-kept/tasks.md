# Tasks

Paths are under `tab-recap/` unless stated otherwise. Each group ends with `bash ci/lint.sh` and `bash ci/test.sh`
passing. Every code merge request ticks its own boxes and names itself on the line. One merge request carries groups
1 to 3.

## 1. Domain

- [x] 1.1 `MissedFacts` (`append` | `wait`) and `missedFactsOf` in `src/recap/domain/autocompact.ts`, default `append`;
      `src/daemon/config.ts` reads `TAB_RECAP_AUTOCOMPACT_MISSED_FACTS` into the autocompact policy. (!109)
- [x] 1.2 Verify: unit tests for `missedFactsOf` (`append`, `wait`, unset, any other value). (!109)

## 2. The flow

- [x] 2.1 `Link` gains `appends` (ceiling override applies, or the key is `append`); `verified`, `rememberCoverage`,
      `bestBrief` and `blockedByCoverage` read it as design D1 says; `decider-cannot-answer` with a written brief goes
      ahead unchanged; `no-brief` and `no-decider` stay blocked below the ceiling. (!109)
- [x] 2.2 The decision amend keeps gate and verdict when the brief goes ahead, `why` from `coverageWhy`; the log line
      drops `ceiling` below the ceiling. (!109)
- [x] 2.3 Verify in `test/compaction*.test.ts` and `test/autocompact*.test.ts`: "A failed check below the ceiling",
      "A check that cannot answer below the ceiling", "No brief below the ceiling", "The missed facts key set to wait",
      and the existing ceiling scenarios unchanged. (!109)

## 3. Docs and setup

- [x] 3.1 `README.md` (autocompact section, next to the ceiling override) and `config.example.env` document the key. (!109)
- [x] 3.2 The setup modal shows the key beside the ceiling override and respects an environment lock. (!109)
- [x] 3.3 Run strict OpenSpec validation from the repository root, and `bash ci/lint.sh` and `bash ci/test.sh` from
      `tab-recap/`. (!109)

## 4. After it ships

- [x] 4.1 Promoted to the live plugin (2.5.0, daemon started 2026-10-11 11:35 UTC). Counted at 2026-10-11 20:18 UTC,
      8 h 43 min after the start (the operator asked for the initial changes to be finished today, so the 24-hour window
      is not reached): `skipped`/`coverage` automatic compactions: 0 (79 in the 36 hours before the change); typed
      automatic compactions: 22 (17 compacted, 5 unconfirmed; 41 in the 36 hours before); 9 briefs went ahead with
      `missed facts appended` in the daemon log. No 24-hour recount was made. (!127)

## 5. Archive

- [x] 5.1 Archive the change in its own merge request. (!127)
