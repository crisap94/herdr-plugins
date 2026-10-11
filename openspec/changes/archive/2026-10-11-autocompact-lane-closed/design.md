# Design: a lane that closes mid-compaction ends skipped

## Context

| Fact | Measured | Where |
| --- | --- | --- |
| Automatic compactions that reached typing | 74 (compacted, failed, unconfirmed) of 161 records in about 38 h | `compaction` table, 2026-10-11 08:05 UTC |
| Ended `failed` with `agent_not_found` | 15 of 74 (20 %); 14 after a written brief, 1 before any brief | `compaction.why` |
| Writer time spent on them | 22 to 66 s each, median 29 s, 470 s in total; writer Codex `gpt-6.1-sol` `high` | `compaction` stage times |
| Decider spend of the same decisions | ask 5 910 + coverage 651 micro-USD, of 80 376 over 157 linked automatic decisions (8 %) | `autocompact_decision.cost_micro_usd` |
| When the lanes closed | all 15 while the writer ran; none between the first status check and the brief | stage times against the close |
| Lane status at decision time | not stored today | neither record keeps it |
| Board drop after a close | 10 closes on a scratch workspace: the `pane.closed` event reached a subscriber 58 to 226 ms (median 162 ms) after the close command was issued; applying it to the board with the fold took at most 0.2 ms; the pane was gone from the board after every one (10 of 10) | 2026-10-11 09:00 UTC, run with the plugin's `subscribe`, `decode` and `observe`; measured at a subscriber, not inside the live daemon's loop |

The flow today (`src/recap/application/compaction.ts`): the decider answers in `Autocompact`; `Compaction.run` picks the lane
from the board and calls `gated`, whose `gateOf` asks herdr for the agent's status (the first check); `Compaction.compact` writes
the brief (`verified`: writer, then for an automatic compaction the coverage check and possibly a rewrite); then `gated` runs again
(the second check) and the command is typed. `gateOf` turns any `Unknown` from herdr into `failed` with reason `error`.

## D1 — A closed lane is its own end

`agent_not_found` means herdr knows the pane is gone; it is not an error of the plugin. `gateOf` tells it apart from other unknown
answers and refuses with `skipped`, why `lane closed`. Herdr not answering at all keeps today's `failed`, because the lane may still be
there. The same end applies to any origin: an operator's or a token's compaction of a lane that closed has nothing left to compact
either.

What changes with the end: no "could not compact" toast (one log line names the lane and the stage it reached); the compaction
record ends `skipped` with why `lane closed`; nothing counts it as a failure. A token request answers with the existing `skipped`
reason, so the token protocol gains no reason. No lane header shows the result, since the lane is gone.

## D2 — The board is checked between the expensive steps

The board already drops a pane when the fold sees it close (`closed` intent), and reading it costs no call to herdr. The flow asks
one predicate, "does the board still list this pane", at four points:

1. before the writer starts (a lane that closed while the decider answered spends no writer);
2. after the writer and before the coverage check (no decider call for a brief nobody will read);
3. before a rewrite (no second writer call);
4. before typing, next to the existing second status check.

A failed predicate ends the compaction as D1 does. The predicate is a port on the board, not a herdr call, so it adds no load and
no latency. The board drops a pane within about a quarter of a second of herdr closing it (the Context table, task 6.1); the status checks
of `gated` stay and catch what the board has not seen yet.

Why not re-check only before the brief (option A of the measurement): the gap between the first status check and the brief is
milliseconds, and none of the 15 closes fell in it.

## D3 — The decision records the lane's status

`autocompact_decision` gains `lane_status`: the herdr status the gate read when the decision was taken (`idle`, `done`, or
`working` for a kind that queues a compaction while working). Rows from before the change read as not recorded (`NULL`), never as
a status. The migration takes the next free number when it lands; today main holds 016, the lane-handoff change brings 017 and its
retention change 018, so this one expects 019 and takes whatever is free at its landing. `tab-recap autocompact` shows the status
beside each decision.

## Deferred

- **C2: cancel the writer when the lane closes.** A cancellation in `Harness.run` (six harnesses) and in the process `Runner`,
  raced against the board predicate. It would save about half of the 22 to 66 seconds per event and the coverage calls. It is the
  large part: a port change in every harness, a new outcome next to `Unknown`, tests per harness, and the risk of partial output
  files from a killed writer. Decided after two weeks of this change's records (a review window chosen, not measured): if closes during the writer stay near today's rate,
  C2 is specified; if D2 and the status data show they are rare, it is dropped.
- **E: do not brief `done` lanes below the ceiling.** Decided on the recorded `lane_status`: the share of `lane closed` ends whose
  decision was taken on a `done` lane, over the same two weeks. It changes policy for long-lived agents that rest in `done`, so it
  is not decided without that share.

The two-week count (the `lane closed` ends by stage reached and by `lane_status`, with the query and its time) is a follow-up
measurement after this change is archived, not a task of it, so the archive does not wait for it.

## Rejected

- **D: keep the brief as the closed lane's handoff text.** The brief is already stored with its decision for
  `TAB_RECAP_KEEP_BRIEF_DAYS` (14 days by default). For an orchestrator's finished child there is no successor to read it. If the
  lane-handoff changes want it, they link the closed lane's record to the decision id themselves.

## Built-ins

No hand-written piece is added: the predicate reads the board, and the migration uses the existing runner.
