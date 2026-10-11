# Proposal: Lane handoff (slice 1)

## Why

After a lane is cleared, crashes, or is replaced by another agent, the operator needs to continue its work with a fresh or named agent. The ledger already preserves the facts the recap keeps, but there is no operator command that renders those facts, with where the work stands, into a bounded continuation request and delivers it safely to another lane.

## What changes

Add `tab-recap handoff` as an operator command. The operator identifies one source lane and an existing target pane. The command renders the selected task's ledger deterministically and supports a dry run (`--print`) that renders the same handoff, minus the delivery checks, without delivering. Otherwise it writes a handoff request to the request queue; the daemon takes it, delivers only when the target is idle or done with no work in flight, and writes a closed outcome that the command waits for and maps to its exit code. Delivery uses a typed plan declared by the target's registered agent adapter, a typing lease taken without waiting, and the prompt boundary.

The handoff is English, first person, operator-voiced markdown, delivered as one first prompt that begins with a fixed preamble telling the receiver to verify the claims. It contains the goal, the open facts by section, the facts closed in the last two hours, decisions with their reasons and every fact's last-seen time, preceded by a Freshness block (when the ledger was last written, how many newer prompts the lane has, the lane's status) and followed by a read-only Worksite snapshot (directory, repository, branch, last commit, uncommitted paths, most-edited files, names of waiting tokens). It is bounded by a 16 KiB byte budget with whole-fact pruning and a visible count of what was omitted or withheld. `--refresh` first asks for a recap run so the ledger is current. Facts that name the plugin, its recap, a tab or herdr are dropped before delivery, while a tool call is kept. It is a static render of ledger facts and makes no model call. The command is local and writes nothing outside the plugin's state directory except the delivery.

## Capabilities

- Add `tab-recap/lane-handoff` for content, freshness, worksite, source and target resolution, safe delivery, outcomes, and printing.
- Modify `tab-recap/cli` to add the command, flags, usage, and exit behavior.
- Modify `tab-recap/harness-adapters` to declare the handoff plan and its conformance expectations.
- Modify `tab-recap/agent-compaction` so that a lane holds one claim, compaction or handoff, and a compaction request for a handoff-held lane is answered `failed-lane-busy`.
- Modify `tab-recap/state-migrations` with the handoff migration (016, after the token protocol's 015): the `handoff` request kind, its target pane and refresh columns, and the `handoff_answer` table.
- Modify `tab-recap/lane-tokens` to declare the compaction answer stage `failed-lane-busy`.

## Depends on

- `token-protocol`: its ask ledger records each taken handoff, and its text of the compaction exchange is the base of this change's `lane-tokens` delta. It lands first.

## Impact

Implementation uses the existing ledger read port, lane and agent status, registered adapter boundary, request queue, typing lease, transcript readers, read-only git, and en/es catalogs. It introduces no runtime dependency and changes no existing ledger facts. It adds one request kind and one answer table through one migration, a `HandoffAnswers` port, a read-only `WorksiteReader` port, a `tabOf` read, and a shared in-flight function. It also removes three duplications it meets: the compaction word list, the recap wait constant, and the private in-flight function. A later change can add a source that survives lane closure and a channel that lets another tool queue the same request and read the same answer row, without changing the content builder or the delivery contract; the source is a typed seam for that reason.

The implementation MR carries `changelog::added`. This spec-only MR carries `changelog::internal`.

## Out of scope

- Slice 2: retention of a closed lane's ledger for 14 days and the closed-lane source selector.
- A request channel for other tools (herdr tokens) and any change to the token protocol: that is the later change `lane-handoff-exchange`.
- A column key, automatic or scheduled handoff, handoff to a remote machine, and automatic creation of a pane or tab.
- Using a model to write the handoff, including reuse of the compaction brief job.
- A flat single-line serialization and a typed-line delivery mode (open question 4).
- The lane's last turns (the ledger and the newer-prompts count stand for them) and a worktree path.
