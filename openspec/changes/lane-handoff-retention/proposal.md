# Proposal: Closed-lane retention

## Why

A lane can close while its task's facts remain in the ledger, but the store does not preserve when that lane closed or a stable way to identify its last task. The current handoff command can therefore resolve only a live lane. Retaining a typed closure record for 14 days lets a later handoff follow-up resolve the facts of a recently closed lane.

## What changes

Add closed-lane retention with a default window of 14 days. When the daemon observes a tracked lane closing, it records the lane's tab, pane, last task association when known, and the observation time. The record is a typed identity `(tab, pane, closed-at)` and does not copy facts or transcript content. A typed resolver composes that record with the existing ledger read port and reports `found`, `expired`, `never-seen`, or `unknown`.

The new window is controlled by `TAB_RECAP_CLOSED_LANE_DAYS`, parsed once with the daemon configuration. Zero keeps closure records indefinitely; invalid values use the default. The existing `TAB_RECAP_KEEP_DAYS` remains the tab-wide cleanup window, but an unexpired closed-lane record protects its tab's data until the lane window expires. The existing environment-only settings pattern is retained; no settings-modal row is added.

## Capabilities

- Add requirements to `tab-recap/state-store` for closed-lane closure records, resolution, and interaction with tab retention.
- Keep `tab-recap/fact-ledger` unchanged: the fact model and ledger ownership do not change.

## Impact

The change adds a retention-owned table in a forward-only database migration and extends the existing retention port and repository. The table contains only tab and pane identifiers, the task association when one exists, and the close observation time. It copies no prompt, transcript, cwd, repository path, or fact text. All persisted state remains in the plugin's state directory; no runtime dependency is added.

The spec-only MR carries `changelog::internal`. The implementation MR will carry `changelog::changed`, because it changes when tab data becomes eligible for deletion and adds a configurable retention rule.

## Out of scope

- Changing the existing tab-wide retention default, eligibility rule, or handling of open columns.
- Changing ledger facts or deleting facts when a lane closes; facts remain task-owned and are removed with their tab.
- Changing the handoff command in this change. A separate follow-up will consume the resolver.
- Retaining transcripts, prompts, agent sessions, or any data outside the plugin's state directory.
- The later versioned, opt-in lane token that announces handoff availability.
- A settings-modal row for the new retention setting.

## Merge request labels

This spec-only MR carries `changelog::internal`. The implementation MR carries `changelog::changed` because retention behavior changes for tabs with a retained closed lane.
