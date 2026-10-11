## MODIFIED Requirements

### Requirement: Every decision is recorded and listable

Each decision that passed the gates SHALL be stored with:
- its lane, time and mode;
- the share, tokens and window;
- the gate and the verdict, and the verdict the decider asked for (`asked_verdict`), which stays when a check later
  turns the verdict into `wait`;
- the answers, and the coverage when there is one: its outcome (`passed`, `missed` or `unchecked`), for `unchecked` its reason
  (`no-decider`, `decider-cannot-answer` or `no-brief`), the count of facts the typed brief missed, the check's time and,
  when the decider reports one, its cost;
- the decider, its cost and its time;
- the brief text, the facts it was checked against and the indexes of the facts appended to it, in a record of their own keyed
  by the decision, kept for
  `TAB_RECAP_KEEP_BRIEF_DAYS` days;
- once one begins, the compaction it led to.

A decision's `why` SHALL be written by the gate when it decides and MAY be amended once a check has run. An amend SHALL join
its reason after the stored one, separated by `; `, so the stored reason is never lost; an amend with no reason SHALL keep the
stored reason, and a decision stored with no reason SHALL take the amend's reason as it is.

Each lane a gate stopped SHALL keep its latest skip, replaced at every skip and removed when the lane gets a
decision: the time, the gate (`below-minimum`, `busy`, `in-flight`, `cooldown`, `unchanged`, `coverage-backoff` or
`no-context`), the share when known, and a detail. With autocompact `off` no skip SHALL be recorded. The daemon
SHALL log a skip only when the lane's gate differs from its previous skip.

`tab-recap autocompact` SHALL list the newest twenty decisions read-only, with the last day's total cost,
then the lanes not decided now with their gate and detail. The expanded view's session facts SHALL count the
tab's decisions, compactions and waits.

#### Scenario: Listing

- **WHEN** the operator runs `tab-recap autocompact` after three decisions, with one other lane stopped by
  `in-flight`
- **THEN** it SHALL print three decision rows, newest first, with share, verdict, decider and cost, then one
  line for the stopped lane with its gate, and SHALL change no column

#### Scenario: A skip is not repeated in the log

- **WHEN** a lane is `below-minimum` at five sweeps in a row
- **THEN** the daemon SHALL log it once and keep one skip row for it

#### Scenario: A check amends the verdict and keeps the asked one

- **WHEN** a decision asked `compact` at 60 % is turned into `wait` by a failed check
- **THEN** the listing SHALL show `wait` with gate `coverage`, and the stored row SHALL still hold `compact` as its
  asked verdict

#### Scenario: Rows from before the change

- **WHEN** the operator lists decisions stored before the change
- **THEN** their asked verdict SHALL read as not recorded, never as `compact`

#### Scenario: A ceiling decision keeps its flight detail beside the coverage reason

- **WHEN** a lane at the ceiling is decided `compact` with the reason `ceiling-overrides-wait (awaiting reviewer); background: 1 kept running`,
  and its brief check then misses one fact, which is appended
- **THEN** the stored `why` SHALL read `ceiling-overrides-wait (awaiting reviewer); background: 1 kept running; 1 fact missed; missed fact appended`

#### Scenario: One side of the reason is empty

- **WHEN** a decision stored with the reason `the decider said wait: too early` is amended with no reason, and another decision
  stored with no reason is amended with `the brief still misses 1 fact(s)`
- **THEN** the first SHALL keep `the decider said wait: too early` and the second SHALL read `the brief still misses 1 fact(s)`
