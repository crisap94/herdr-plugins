# Proposal

## Why

Over about 38 hours of stored automatic compactions, 15 of the 74 that reached the typing stage (compacted, failed or
unconfirmed) ended `failed` with `agent_not_found`: 20 %. In 14 of the 15 the brief had already been written. The writer ran 22 to
66 seconds on each (median 29 s), 470 s in total, and the decider spend of the same decisions was 5 910 micro-USD for the ask and
651 for the coverage check, out of 80 376 over all 157 linked automatic decisions (8 %). The writer's own cost is not recorded.
Nearly all of these lanes were short-lived child agents that their orchestrator closed while the plugin was briefing them.

Every one of the 15 closed while the writer ran. The only check between the spend and the typing is the status check after it,
so the plugin spends the whole brief, then reports a failure and shows a "could not compact" toast for a lane that no longer
exists. These are not failures of the plugin, and counting them as failures hides the real ones.

## What Changes

- **A closed lane ends skipped, not failed.** When the lane's pane is gone (the board no longer lists it, or herdr answers
  `agent_not_found`), the compaction ends `skipped` with the reason `lane closed`, whatever started it. No failure toast is shown and
  nothing counts it as a failure. Other unreachable causes, such as herdr not answering, stay `failed`.
- **The flow looks at the board between the expensive steps.** Before the writer, after the writer and before the coverage check,
  before a rewrite, and before typing, the flow checks that the board still lists the lane's pane. The check makes no call to herdr.
  A lane that closed while the decider answered spends no writer; one that closed while the writer ran spends no coverage check, no
  rewrite and no typing attempt.
- **Each decision records the lane's status.** The autocompact decision stores the herdr status of the lane when it was decided
  (`idle`, `done`, or `working` for a kind that queues), so the deferred options below can be decided on data.

## Deferred, with what they wait for

- **Cancelling the writer when the lane closes** saves the writer time itself, on average about half of the 22 to 66 seconds per
  event. It needs a cancellation in the harness port, in all six harnesses and in the process runner. It is decided once this change
  has shown how many closes still happen during the writer.
- **Not briefing `done` lanes below the ceiling** may avoid the spend entirely, if most closed lanes were `done` when they were
  decided. It changes policy for long-lived agents that rest in `done`, so it waits for the recorded status.

## Out of scope

- Keeping the brief of a closed lane as handoff text. The brief is already kept with its decision for `TAB_RECAP_KEEP_BRIEF_DAYS`;
  attaching it to a closed lane belongs to the lane-handoff changes, if they ask for it.
- The token protocol. A compaction asked for by token whose lane closed answers with the existing `skipped` reason; no reason is
  added.
- An operator's compaction keeps its flow, apart from the closed-lane end.

## Merge request

This change: `changelog::internal`. The code merge request that implements it: `changelog::fixed`.
