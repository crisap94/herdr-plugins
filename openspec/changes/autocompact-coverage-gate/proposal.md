# Proposal

## Why

Over 32.3 hours of live autocompact (202 decisions, 67 compactions, 816 recap runs, since 2026-10-08 19:53Z), the brief
check decided most outcomes. Of the 40 decisions whose verdict was `compact`, 20 were compacted and 19 were turned into
`wait` by the brief check (gate `coverage`). The check passed 0 of 12 checks for briefs on tabs with 15 or more open goal,
needs, decisions and rules facts, and 17 of 18 for tabs with 5 or fewer. Producing the 20 automatic compactions took 72
brief writes, and the 19 blocked flows took 23.5 minutes of writer time. The same lanes failed again and again (one lane
five times, another five times, a third four times). Three compactions were done by hand at the same token count right
after the check had blocked them.

Two faults in the code cause most of this:

- The check runs for the ceiling too. A lane at or above the ceiling is compacted without a model call for the decision,
  but its brief is still checked. One ceiling lane (75 %, under `eager`) was held by the check through three brief
  rounds (33, 42 and 32 facts missing), and it was logged again at 85 % and held again. One orchestrator lane crossed
  80 % at 01:23 and was compacted by hand at 03:41, held in between by the in-flight gate and the one-at-a-time lock,
  not by the check.
- The record keeps only the final verdict. `amend` overwrites `compact` with `wait` and sets the gate to `coverage`, so
  the verdict the decider asked for is lost. The effect of the check cannot be measured afterwards.

The check's scope (up to 40 facts, each needing a reason, in a brief capped at 3 000 characters) is the other cause.
Changing that scope is a separate change, because it can only be judged on stored briefs, and the briefs are not kept
today. This change stores them so that the later change can be replayed.

## What Changes

- **The check does not block the ceiling, by default.** A lane at or above the ceiling is compacted whatever the check
  says. The better of the two briefs written (fewer missing facts; the rewrite on a tie) is typed, with the missed
  goal, needs, decisions and rules facts appended verbatim, so a rule the brief dropped still reaches the agent. When no
  brief text exists, the same text an operator's compaction gets is typed. The check still runs and is recorded. A
  switch, `TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK`, returns the ceiling to the check (`off`).
- **The asked verdict is kept.** A new column `asked_verdict` holds the decider's verdict before the check. `verdict`
  stays the effective one (`wait` when the check blocked the lane), so every existing reader keeps its meaning.
- **The check's evidence is kept.** Each decision records the check's outcome, missing count, time and, when the decider
  reports one, its cost. The brief text and the fact texts it was checked against are kept in their own table for 14
  days (`TAB_RECAP_KEEP_BRIEF_DAYS`).
- **A failed check can back off.** After a `coverage` wait, a lane below the ceiling is not asked and not briefed again
  for a window (`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS`). The skip gate is `coverage-backoff`. The default is `0`
  (off) until the replay in tasks 8.2 measures what a window would delay.

## Out of scope

- The check's scope and pass mark. Which facts are checked and how many stays exactly as today until the replay of the
  stored briefs says otherwise (see the follow-up change in the design's open questions).
- The in-flight gate. It holds the orchestrator lane that reached 86 % (held about 4.5 hours before a manual compaction).
  It is checked before the ceiling and this change does not touch it. Letting the ceiling override an unreadable or
  long-running in-flight state is a separate item, and it needs a test first.
- The decider's six questions, its style numbers, and the default ceiling (80 with `balanced`) and minimum.
- The operator's compactions, which are not checked (unchanged).
- The brief writer, its model and effort. The brief-writer replay is a separate measurement.
- Keeping brief text on the compaction row itself: the compaction row is unchanged.

## Impact

- Code: `src/recap/application/compaction-coverage.ts`, `compaction.ts`, `autocompact.ts` and `autocompact-gates.ts`
  (`src/recap/domain/autocompact.ts` for the new skip gate and the typed outcome), `src/adapters/db/autocompact-records.ts`
  and a new brief repository, a new migration `014` (never an edit of `010`–`013`), `src/recap/application/input-retention.ts`
  (a second dependency for the brief clearing), `src/recap/application/autocompact-listing.ts` (the `asked` column),
  `src/daemon/config.ts` (the typed settings), i18n strings.
- Docs: `config.example.env`, `README.md`, `CONTEXT.md` (new nouns: asked verdict, coverage backoff, ceiling override,
  brief retention).
- Behaviour with the default settings:
  - lanes at or above the ceiling are compacted when the check fails (a change, switchable);
  - the backoff is off (`0`), so no lane is held by it.

## Changelog

This specification change lands with the label `changelog::internal`. The implementation merge request carries
`changelog::changed`, because a ceiling compaction is no longer blocked by the check by default.
