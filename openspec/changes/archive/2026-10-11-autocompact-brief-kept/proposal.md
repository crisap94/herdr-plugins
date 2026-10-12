# Proposal: a written brief is never thrown away

## Why

Measured on 2026-10-11 at 04:53 UTC from the plugin's own records (`compaction` and `autocompact_decision` in
`tab-recap.db`) on one machine, over the previous 36 hours:

- 79 automatic compactions wrote their brief and then ended `skipped` with reason `coverage`; 41 automatic compactions
  were typed. Each discarded brief was written twice (the daemon log says `the brief misses N fact(s); written again`
  before every one), by the configured brief writer, here Codex `gpt-6.1-sol` at `high`: about 158 brief calls whose
  output was never used.
- One lane alone (`w21:pB1`) was discarded 26 times. The backoff that should hold a lane after a failed check is off
  by default (`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS=0`), so a lane is briefed again at every cooldown; and when it
  is on, a lane that keeps working outgrows it (10 % of a 1 000 000-token window) within one turn or two.
- The first brief of a long coordinating lane misses many facts (the log shows 1 to 61), and the rewrite still misses
  some, so below the ceiling the same lane fails the check every time until it reaches the ceiling. At the ceiling the
  plugin already types the better brief with the missed facts appended verbatim (04:40 UTC: `16 facts missed; missed
  facts appended`). Waiting below the ceiling buys nothing: the lane grows, the brief gets harder, and the compaction
  that finally runs is the appended one anyway.

The cost lands on the brief writer's plan, which the lanes share; the operator reported it as tokens lost on bad
compactions.

## What changes

- Below the ceiling, a brief whose check still misses facts after the one rewrite goes ahead the way it does at the
  ceiling: the better of the two briefs is typed, with the missed `goal`, `rules`, `needs` and `decisions` facts appended
  verbatim under the fixed heading, in at most 1 500 characters. The decision keeps its gate and verdict (`ask`,
  `compact`) and its `why` names the count missed.
- A brief that was written but could not be checked (the decider could not answer) goes ahead below the ceiling too,
  as an operator's compaction does: the brief is typed unchanged.
- Nothing is typed, as today, when no brief was written (the template would be used) or no decider is set up below the
  ceiling: nothing was spent, and the template is not an automatic brief.
- A new key, `TAB_RECAP_AUTOCOMPACT_MISSED_FACTS`, chooses `append` (the default) or `wait` (today's rule: a failed
  check below the ceiling is not typed and records `wait` with gate `coverage`). The ceiling override keeps its meaning
  at the ceiling.

## Impact

- `openspec/specs/tab-recap/autocompact/spec.md`: "The brief keeps what the goal needs" is modified.
- Code: `tab-recap/src/recap/application/compaction.ts` (`verified`, `rememberCoverage`, `blockedByCoverage`),
  `compaction-coverage.ts` (`bestBrief` keeps the better brief whenever the result will be typed),
  `src/recap/domain/autocompact.ts` and `src/daemon/config.ts` (the key), the setup modal row, `README.md`,
  `config.example.env`.
- The coverage backoff stays as specified: with `append` it holds only lanes whose check could not run.
- No migration: the outcome and gate columns already hold every value used.
