# Proposal: Lane handoff (slice 1)

## Why

After a lane is cleared, crashes, or moves to a new session, the operator needs to continue its work with a fresh or named agent. The ledger already preserves the facts the recap keeps, but there is no operator command that renders those facts into a bounded continuation request and delivers it safely to another lane.

## What changes

Add `tab-recap handoff` as an operator command. The operator identifies one source lane and an existing target pane. The command renders the selected task's ledger deterministically and supports printing without typing. Otherwise it writes a handoff request to the request queue; the daemon takes it, delivers only when the target is idle or done with no work in flight, and writes a closed outcome that the command waits for and maps to its exit code. Delivery uses a typed plan declared by the target's registered agent adapter, a typing lease, and the prompt boundary.

The handoff contains the goal, open facts, recently closed facts, decisions with their reasons, standing rules, and next steps. It is English, first person, operator-voiced, and bounded to 3,000 characters. Prompt delivery sends it as markdown with a fixed preamble that tells the receiver to verify the claims; line delivery sends a flat form of the same text. Facts that name the plugin, its recap, a tab, or herdr are dropped before delivery, while a tool call is kept. It is a static render of ledger facts and makes no model call.

## Capabilities

- Add `tab-recap/lane-handoff` for content selection, source and target resolution, safe delivery, outcomes, and printing.
- Modify `tab-recap/cli` to add the command, flags, usage, and exit behavior.
- Modify `tab-recap/harness-adapters` to declare the typed handoff delivery side and conformance expectations.
- Modify `tab-recap/agent-compaction` so that a lane holds one claim, compaction or handoff, and a compaction request for a handoff-held lane is answered `failed-lane-busy`.
- Modify `tab-recap/state-migrations` with migration 14: the `handoff` request kind, its target pane column, and the `handoff_answer` table.

## Impact

Implementation uses the existing ledger read port, lane and agent status, registered adapter boundary, request queue, typing lease, and en/es catalogs. It introduces no runtime dependency and changes no existing ledger facts. It adds one request kind and one answer table through migration 14. A later change can add a source that survives lane closure and a token that announces handoff availability, reading the same answer row, without changing the content builder or the delivery result contract.

The implementation MR will carry `changelog::added`. This spec-only MR carries `changelog::internal`.

## Out of scope

- Slice 2: retention of a closed lane's ledger for 14 days, including changes to the Retention port or adapter.
- Slice 3: a versioned opt-in token announcing that a handoff is available, including token-name ownership.
- A column key, automatic or scheduled handoff, handoff to a remote machine, and automatic creation of a pane or tab.
- Using a model to write the handoff, including reuse of the compaction brief job.
- Adding the lane's last turns, repository or branch details, cwd, or edited-file list to the handoff.
