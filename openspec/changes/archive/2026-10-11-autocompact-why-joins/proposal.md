# Proposal

## Why

An automatic compaction records why it was decided. Two steps write that reason. The gate writes the flight detail when it
decides, for example `ceiling-overrides-wait (awaiting reviewer)` or `background: 1 kept running`. The brief check amends the
decision afterwards with its coverage reason, for example `1 fact missed; missed fact appended`. Until now the amend replaced the
stored reason whenever it carried one, so a ceiling decision whose brief missed a fact lost the only record that the ceiling had
overridden a wait. The note the compaction carried is derived from that detail, so the listing could no longer explain the note.

## What Changes

- **The reason is joined, not replaced.** When a decision is amended, its `why` holds the stored reason first, then `; `, then the
  amend's reason.
- **Either side may be empty.** An amend with no reason keeps the stored one; a decision stored with no reason takes the amend's
  reason as it is.

Nothing reads `why` programmatically: it shows in the daemon's log line and in `tab-recap autocompact`. No column, table or
migration changes.

## Out of scope

- How the gate and the brief check word their reasons; only the way the two are combined changes.
- Rows stored before this change keep the reason they hold.

## Merge request

`changelog::fixed`.
