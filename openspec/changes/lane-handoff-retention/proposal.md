# Proposal: Closed-lane retention and the closed-lane handoff source

## Why

A lane leaves the board when its pane closes, when a reconciliation no longer finds it (including an agent that exits while its pane survives), when a different agent appears in its pane, or when a restart finds a persisted lane missing. Its task's facts stay in the ledger, but the store keeps no close time and no link from the closed lane to its task. The retention sweep judges a tab only by its last-seen clock, so it can remove a tab, and the facts of a lane that closed days earlier, while that lane is still recent.

A typed closure record kept for 14 days lets the proposed handoff command continue a recently closed lane. A closed lane is identified by tab, pane and close instant, never by pane alone, because herdr can reuse a pane identifier.

Not every disappearance is a closure. A `/clear` or a new session in a surviving pane records nothing, and its ledger is reachable through the live path. A shell left in a pane after a crash records nothing while herdr still reports the pane as a lane. This change does not cover those cases.

## What changes

- A new domain intent `lane-closed` carries every observed closure of a lane on the board or persisted. Closure detection is one pure function; the fold stays pure and the dispatcher writes the record. It is the only closure detector in the plugin: the same intent also drives the `lane-closed` event, which the lane-token publisher no longer derives from its own diff.
- A closure record stores the tab, pane, agent kind, the lane's last-known working directory, the close instant, and the task association when one exists. It copies no transcript, prompt, repository contents or fact text.
- `TAB_RECAP_CLOSED_LANE_DAYS` (default 14; `0` disables closed-lane retention) sets how long a closure record is retained and resolvable.
- Tab-wide retention in `session-chapters` is modified: a tab that holds a closure record inside the window is not removed, and closure records are removed with their tab.
- A typed resolver returns `found`, `expired`, `never-seen` or `unknown` for a closed-lane identity, with the task's facts as of the close; it is a second entry of the handoff change's source registry.
- The handoff command gains a closed-lane source selector, `--from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>`, and a listing of retained closed lanes, `--list-closed --tab <tab-id>`. The requirements of the handoff change that these touch are restated as modifications, not left in contradiction.

## Capabilities

- **Modified** `tab-recap/session-chapters`: "Closed tabs are removed after a while" also honours closure records.
- **Added** to `tab-recap/state-store`: closure recording, the association, the lane-closure observation rule, the incarnation, the closed-lane window setting, resolution, the fact filter as of the close, listing, pruning, and the old-schema rule.
- **Added** to `tab-recap/state-migrations`: the closed-lane migration.
- **Modified** in `tab-recap/lane-handoff` and `tab-recap/cli`: the source requirements, the content requirement's fact source, the claims requirement for a closed source, and the command syntax. These capabilities exist in main only after the lane-handoff change (slice 1) is archived, so this change MUST be archived after it.
- **Modified** `tab-recap/lane-tokens`: "The plugin's own events are piped into herdr's event stream" now takes `lane-closed` from the fold's closure decision, so one detector decides what a closure is.
- `tab-recap/fact-ledger` is unchanged.

## Impact

The migration is forward-only and follows the handoff migration: it is migration 017 in the numbering table (015 is the token protocol's ask ledger, 016 the handoff migration). It adds one nullable lane column (`since`), one nullable request column (`closed_at`) and the `closed_lane` table. A `ClosedLanes` port with three role interfaces and its own repository owns closure records; tab retention takes the protected tabs as input instead of reading the table. Pure settings parsing and the window function are added to `domain/retention.ts`. All persisted state remains in the plugin's state directory. No runtime dependency is added.

## Out of scope

- Changing the tab-wide retention default (30 days), the eligibility rule for tabs without a column, or the handling of open columns.
- Changing ledger facts, or deleting facts when a lane closes. Facts remain task-owned and are removed with their tab.
- Backfilling closure times for lanes that closed before the migration.
- Attributing runs that finish after a lane's closure record is written.
- Changing the live-lane `--from` path of the handoff command.
- Retaining transcripts, prompts, agent sessions, or any data outside the plugin's state directory.
- A settings-modal row for the new setting.
- A request channel or availability token for other tools (a separate change).

## Labels

The spec-only MR carries `changelog::internal`. The implementation MR carries `changelog::added`: a new setting, a new table and new handoff flags; the retention behaviour itself changes only for tabs whose keep period is shorter than the closed-lane window.

## Implementation order

token-protocol → lane-handoff (slice 1) → lane-handoff-retention (this change) → lane-handoff-exchange (slice 3). Archiving this change before slice 1 creates `tab-recap/lane-handoff` with a placeholder Purpose and `openspec validate --specs --strict` then fails (checked in a scratch copy); archiving slice 1 first, then this change, passes.

## Reconciliation (2026-10-10)

This change was rebuilt against the factory reconciliation plan. What changed from the reviewed head d15911b:

- The migration is 017, not 016: the token protocol's ask ledger takes 015 and the handoff 016, in landing order.
- One closure detector: the fold's `lane-closed` intent also drives the `lane-closed` event (lane-tokens modified), so the
  publisher's own diff no longer decides closures and the two can never disagree.
- The restated handoff requirements follow the reconciled slice 1: a handoff interrupted by a restart is answered
  `failed{interrupted}` from the token protocol's ask ledger, and the readiness hold is the settle time the target's agent
  kind declares.
- Two inconsistencies of the restated text are fixed: a closed source's task is the association stored with its closure
  (not the live lanes of `readRecap`), and a closed source supplies its tab (the "tab cannot be resolved" refusal applies to a
  live source only).
