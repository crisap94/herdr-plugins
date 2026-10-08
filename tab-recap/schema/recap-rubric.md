# Recap rubric

The checks a recap item must pass. One file, quoted verbatim by every job that writes or judges items: the
recap writer's instructions and the judge's instructions embed the two parts below, "Every item" and "Per
section". Each check is a yes/no question with one pass example and one fail example. Edit a check here and
every job carries the new wording.

## Every item

- **I1 atomic** — the item states one fact, action or decision.
  - pass: "Merged !256 after both pipelines went green."
  - fail: "Merged !256, restarted the daemon and updated the docs."
- **I2 stands alone** — the item is understood without the transcript: no unresolved it / this / that / the issue.
  - pass: "`ci/test.sh` still fails on the second run."
  - fail: "It still fails on the second run."
- **I3 specific** — the item names a file, command, reference, value, version, error or person-role.
  - pass: "Run `bash ci/lint.sh` on feat/retry before merging."
  - fail: "Improve the settings."
- **I4 supported** — the run's input contains what the item says.
  - pass: "Pipeline for !256 is green." (the input shows it)
  - fail: "Deployed to production." (the input never mentions a deploy)
- **I5 about the work** — the subject is the work, never the agent or the plugin. In `now`, a lane label before a colon (`a1: waiting for the pipeline`) only says whose lane it is and is not the subject; `a1 is waiting` is.
  - pass: "The research report is written to docs/report.md."
  - fail: "claude completed the research and wrote its report."
- **I6 new** — the item is not a rewording of another item kept in the same recap.
  - pass: "Both pipelines for !256 are green."
  - fail: "Both pipelines for !256 are green, as checked." (next to the item above)
- **I7 still true** — nothing later in the input contradicts the item.
  - pass: "Node db-2 has not rejoined the cluster." (still so at the end of the input)
  - fail: "Node db-2 has not rejoined the cluster." (a later turn says it is Ready)

## Per section

- **S-goal** — an outcome the operator wants, not an activity; it changes only when the operator changes it.
  - pass: "Ship retries for the upload client."
  - fail: "Working on the upload client."
- **S-now** — an activity in progress at recap time, with the agent's label when several agents work.
  - pass: "a1: running the migration test on a copy of the database."
  - fail: "Tests were run earlier today."
- **S-needs** — something the operator can answer: a question or a choice, and what it blocks.
  - pass: "Choose retry count 3 or 5; the client change waits on it."
  - fail: "Consider the retry count."
- **S-done** — a checkable result (an artifact, a number, a state), not effort.
  - pass: "1.9.0 is tagged and the release pipeline is green."
  - fail: "Spent the morning on the release."
- **S-decisions** — the choice and its why, and the rejected option when there was one; not a done item.
  - pass: "Leave the unrelated db tab alone: it is not part of this task."
  - fail: "Leave the unrelated db tab alone."
- **S-next** — an action with its object, that an agent can start.
  - pass: "Rebase feat/retry on main and rerun `ci/test.sh`."
  - fail: "Continue."
- **S-rules** — a standing instruction of the operator, valid beyond the current step.
  - pass: "Never push to main without asking."
  - fail: "Run the tests now."
- **S-links** — a reference that resolves: `!n`, `#n`, a SHA, a branch, a path or a URL.
  - pass: "src/upload/retry.ts"
  - fail: "the thing from before"

## Whole recap (judge only)

- **coverage** — the share of the judge's key facts of the input that the recap carries.
- **filler** — the share of the recap's items that are tied to a key fact (no-filler); the rest is filler.
- **read-back** — six fixed questions answered from the recap alone and graded against the input: the goal,
  what finished, what waits on the operator, what must not be done, why a decision among the key facts was
  taken, and the next action.
