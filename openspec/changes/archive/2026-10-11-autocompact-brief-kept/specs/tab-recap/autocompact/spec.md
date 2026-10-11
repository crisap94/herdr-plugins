## MODIFIED Requirements

### Requirement: The brief keeps what the goal needs

Before an automatic compaction types anything, the plugin SHALL list the open `goal`, `now`, `needs`,
`decisions`, `next` and `rules` facts of the tasks holding the lane (newest first, at most 40). The decider
SHALL say for each whether the brief keeps it, and for each decision whether the brief keeps its reason.

When a `goal`, `needs`, `decisions` or `rules` fact scores below the brief check's pass mark (0.70 with
`balanced`; 0.75 with `gentle`, 0.60 with `eager`, or the advanced key `TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST`),
the brief SHALL be rewritten once, with the missing facts named. If one still scores below the pass mark, a written
brief SHALL NOT be thrown away while `TAB_RECAP_AUTOCOMPACT_MISSED_FACTS` is `append` (the default): the automatic
compaction SHALL go ahead with the better of the briefs written and the missed facts appended, as the last paragraph of
this requirement sets out, at any share of the window. When the key is `wait`, a lane below the ceiling SHALL NOT be
typed and the decision SHALL be recorded as `wait` with gate `coverage`. Any other value of the key SHALL fall back to
`append`, and the key SHALL be read for each compaction.

When a brief was written but its check could not answer, a lane below the ceiling SHALL be typed with that brief
unchanged while the key is `append`, and SHALL NOT be typed with `wait`. When no decider is set up or no brief was
written (the template would be used), a lane below the ceiling SHALL NOT be typed and the decision SHALL be recorded as
`wait` with gate `coverage` and the reason. An operator's compaction is not checked in this release: its flow is
unchanged.

Whatever the check finds, the decision SHALL keep the verdict the decider asked for in `asked_verdict`, and the
brief text with the facts it was checked against SHALL be kept for `TAB_RECAP_KEEP_BRIEF_DAYS` days (14 by default;
0 keeps none).

A lane at or above the ceiling SHALL NOT be blocked by the check while `TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK`
is `on` (the default). Its automatic compaction SHALL go ahead with the better of the briefs written: the one that missed fewer facts, the rewrite on a tie.
A brief whose check could not answer has no count and SHALL NOT be preferred over a checked one; when the rewrite is unchecked,
the first brief, whose missed facts are known, SHALL be typed. The goal, needs, decisions and rules facts that the typed brief
missed SHALL be appended to it verbatim, under a fixed heading, in the order goal, rules, needs, then decisions newest first, in
at most 1 500 characters; the heading SHALL say how many were left out. When no brief text exists, the text an operator's
compaction is given SHALL be typed. The decision SHALL keep its gate (`ceiling` at the ceiling, `ask` below it) and
verdict `compact`; when the check failed, its `why` SHALL name the count of facts missed, and the check's answers SHALL
still be recorded. When the ceiling setting is `off`, a lane at the ceiling SHALL be treated as a lane below it.

#### Scenario: A decision without its reason

- **WHEN** the brief keeps a decision's text but `brief_keeps_reason` is 0.20, also after the rewrite, the lane is
  below the ceiling and the missed facts key is `append`
- **THEN** the better brief SHALL be typed with that decision and its reason appended verbatim, and the decision SHALL
  be `compact` with gate `ask`

#### Scenario: Only a next step missing

- **WHEN** every goal, needs, decision and rule fact is kept and one `next` fact scores 0.40
- **THEN** the compaction SHALL go ahead with nothing appended and the coverage SHALL be recorded

#### Scenario: The pass mark of the style

- **WHEN** a `needs` fact scores 0.65 and the style is `eager`
- **THEN** the fact is kept, and under `balanced` it is missing

#### Scenario: A failed check below the ceiling

- **WHEN** a Claude lane at 60 % gets `compact`, the first brief misses three `needs` facts and the rewrite misses two,
  and the missed facts key is `append`
- **THEN** the rewrite SHALL be typed with the two missed `needs` facts appended verbatim, the decision SHALL be
  `compact` with gate `ask` and `asked_verdict` `compact`, its `why` SHALL name the count of facts missed (two), and the
  brief, the checked facts and the check's answers SHALL be kept

#### Scenario: The missed facts key set to wait

- **WHEN** a Claude lane at 60 % gets `compact`, the brief still misses two `needs` facts after the rewrite, and the
  missed facts key is `wait`
- **THEN** nothing SHALL be typed, the decision SHALL be `wait` with gate `coverage`, its `asked_verdict` SHALL be
  `compact`, and the brief and the checked facts SHALL be kept

#### Scenario: A check that cannot answer below the ceiling

- **WHEN** a Claude lane at 60 % gets `compact`, a brief is written, and the decider cannot answer the check
- **THEN** the brief SHALL be typed unchanged and the decision SHALL be `compact` with gate `ask` and coverage outcome
  `unchecked`

#### Scenario: No brief below the ceiling

- **WHEN** a Claude lane at 60 % gets `compact` and the brief writer returns no text
- **THEN** nothing SHALL be typed and the decision SHALL be `wait` with gate `coverage` and the reason

#### Scenario: A failed check at the ceiling

- **WHEN** a Claude lane at 84 % gets gate `ceiling`, the first brief misses three `needs` facts and the rewrite misses
  two, with the override `on`
- **THEN** the rewrite SHALL be typed with the two missed `needs` facts appended verbatim, the decision SHALL be `compact`
  with gate `ceiling` and `asked_verdict` `compact`, its `why` SHALL name the count of facts missed (two), and the check's answers
  SHALL be recorded

#### Scenario: The rewrite cannot be checked

- **WHEN** a Claude lane at 84 % gets gate `ceiling`, the first brief misses two `needs` facts, and the rewrite cannot be checked
- **THEN** the first brief SHALL be typed with the two missed `needs` facts appended verbatim, the decision SHALL be `compact` with
  gate `ceiling`, and its coverage outcome SHALL be `missed` with a count of two

#### Scenario: The ceiling override switched off

- **WHEN** a Claude lane at 84 % gets gate `ceiling`, the brief misses two `needs` facts after the rewrite, the
  override is `off`, and the missed facts key is `wait`
- **THEN** nothing SHALL be typed and the decision SHALL be `wait` with gate `coverage`

#### Scenario: A ceiling without a decider

- **WHEN** a Claude lane at 84 % gets gate `ceiling` and no decider is set up
- **THEN** the compaction SHALL go ahead with the text an operator's compaction is given, the decision SHALL be
  `compact` with gate `ceiling` and no coverage, and the log SHALL say that no check ran
