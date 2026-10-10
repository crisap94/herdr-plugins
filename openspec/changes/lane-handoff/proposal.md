# Proposal: Lane handoff (slice 1)

## Why

After a lane is cleared, crashes, or moves to a new session, the operator needs to continue its work with a fresh or named agent. The ledger already preserves the facts the recap keeps, but there is no operator command that renders those facts into a bounded continuation request and delivers it safely to another lane.

## What changes

Add `tab-recap handoff` as an operator command. The operator identifies one source lane and an existing target pane. The command renders the selected task's ledger deterministically, supports printing without typing, and otherwise delivers only when the target is idle or done with no work in flight. Delivery uses a typed plan declared by the target's registered agent adapter, a typing lease, and the prompt boundary. The command reports a closed outcome and uses the existing command exit-code convention.

The handoff contains the goal, open facts, recently closed facts, decisions with their reasons, standing rules, and next steps. It is English, first person, operator-voiced, bounded to 3,000 characters, and vetted so the rendered text never names the plugin, its recap, a tab, or a tool. It is a static render of ledger facts and makes no model call.

## Capabilities

- Add `tab-recap/lane-handoff` for content selection, source and target resolution, safe delivery, outcomes, and printing.
- Modify `tab-recap/cli` to add the command, flags, usage, and exit behavior.
- Modify `tab-recap/harness-adapters` to declare the typed handoff delivery side and conformance expectations.
- Modify `tab-recap/agent-compaction` to specify shared lane claims and typed delivery safety where behavior is shared.

## Impact

Implementation uses the existing ledger read port, lane and agent status, registered adapter boundary, request queue, typing lease, and en/es catalogs. It introduces no runtime dependency, writes no handoff row, and changes no existing ledger facts. A later change can add a source that survives lane closure and a token that announces handoff availability without changing the content builder or delivery result contract.

The implementation MR will carry `changelog::added`. This spec-only MR carries `changelog::internal`.

## Out of scope

- Slice 2: retention of a closed lane's ledger for 14 days, including changes to the Retention port or adapter.
- Slice 3: a versioned opt-in token announcing that a handoff is available, including token-name ownership.
- A column key, automatic or scheduled handoff, handoff to a remote machine, and automatic creation of a pane or tab.
- Using a model to write the handoff, including reuse of the compaction brief job.
- Adding the lane's last turns, repository or branch details, cwd, or edited-file list to the handoff.

## Merge request labels

The spec-only MR carries `changelog::internal`. The implementation MR will carry `changelog::added`.
