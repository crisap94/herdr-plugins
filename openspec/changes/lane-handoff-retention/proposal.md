# Proposal: Closed-lane retention and the closed-lane handoff source

## Why

A lane leaves the board when its pane closes, when a reconciliation no longer finds it (including an agent that exits while its pane survives), or when a restart finds a persisted lane missing. Its task's facts stay in the ledger, but the store keeps no close time and no link from the closed lane to its task. The retention sweep judges a tab only by its last-seen clock, so it can remove a tab, and the facts of a lane that closed days earlier, while that lane is still recent.

A typed closure record kept for 14 days lets the handoff command continue a recently closed lane. A closed lane is identified by tab, pane, and close instant, never by pane alone, because herdr can reuse a pane identifier.

Not every disappearance is a closure. A `/clear` or a new session in a surviving pane records nothing. A shell left in a pane after a crash records nothing while herdr still reports the pane as a lane. This change does not cover those cases.

## What changes

- A new domain intent `lane-closed` carries every observed closure of a lane on the board. The fold stays pure; the dispatcher writes the closure record.
- A closure record stores the tab, pane, agent kind, the lane's last-known working directory, the close instant, and the task association when one exists. It copies no transcript, prompt, repository contents, or fact text.
- `TAB_RECAP_CLOSED_LANE_DAYS` (default 14; `0` disables closed-lane retention) sets how long a closure record is retained and resolvable.
- Tab-wide retention in `session-chapters` is modified: a tab that holds a closure record inside the window is not removed, and closure records are removed with their tab.
- A typed resolver returns `found`, `expired`, `never-seen`, or `unknown` for a closed-lane identity. Facts come from the existing ledger port, which does not change.
- The handoff command gains a closed-lane source selector, `--from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>`, and a listing of retained closed lanes, `--list-closed --tab <tab-id>`. The selector is an alternative to `--from`; the exact listing shape is an open question.

## Capabilities

- **Modified** `tab-recap/session-chapters`: "Closed tabs are removed after a while" also honours closed-lane records. No other change in `openspec/changes/` modifies that requirement.
- **Added** to `tab-recap/state-store`: closure recording, the lane-closure observation rule, the closed-lane window setting, lane incarnation persistence, closed-lane resolution, closed-lane pruning, and closed-lane listing.
- **Added** to `tab-recap/state-migrations`: migration 15.
- **Added** to `tab-recap/lane-handoff`: the closed-lane source selector, its outcomes, and the closed-source Freshness line. That capability exists in main only after the lane-handoff change (slice 1) is archived, so this change MUST be archived after it.
- `tab-recap/fact-ledger` is unchanged. Ledger facts and their ownership do not change.

## Impact

Migration 15 is forward-only and follows migration 14, which the lane-handoff change owns. It adds two nullable lane columns (`since`, `session`), one nullable request column (`closed_at`), and the `closed_lane` table. The Retention port gains a closed-lane protection input and a closed-lane removal count. A ClosedLanes port with its own repository owns closure records. Pure settings parsing is added to `domain/retention.ts`. All persisted state remains in the plugin's state directory. No runtime dependency is added.

## Out of scope

- Changing the tab-wide retention default (30 days), the eligibility rule for tabs without a column, or the handling of open columns.
- Changing ledger facts, or deleting facts when a lane closes. Facts remain task-owned and are removed with their tab.
- Backfilling closure times for lanes that closed before migration 15.
- Attributing runs that finish after a lane's closure record is written.
- Changing the live-lane `--from` path of the handoff command.
- Retaining transcripts, prompts, agent sessions, or any data outside the plugin's state directory.
- A settings-modal row for the new setting.
- The later versioned, opt-in lane token that announces handoff availability (slice 3).

## Merge request labels

The spec-only MR carries `changelog::internal`. The implementation MR carries `changelog::changed`, because retention behaviour changes for tabs with a retained closed lane and the handoff command gains a selector.

## Implementation order

lane-handoff (slice 1) → lane-handoff-retention (this change) → slice 3. Archiving this change before slice 1 creates `tab-recap/lane-handoff` with the placeholder Purpose `TBD`, and `openspec validate --specs --strict` then fails (checked in a scratch copy: exit 1). Archiving slice 1 first, then this change, passes (exit 0).
