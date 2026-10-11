# Proposal: the handoff exchange follow-ups

## Why

The handoff exchange and the closed-lane retention landed with review findings that were tracked, not blocking: the token writes of one request were not serialised, the ask and its request row were recorded in separate steps, and several defers of the two slices remained (typing of the answers port, causes lost in swallowed errors, a restart sweep that one bad row could abort, closed-lane dependencies that were optional, files over the size limit). One behaviour of the exchange was also implemented but not written down: a request seen while sharing is off is remembered, so turning sharing on later does not act on an old request, the model the compact exchange already documents.

## What changes

- **lane-tokens** (added): a handoff request seen while sharing is off is remembered and never acted on.
- Wording: the handoff's published `deadline-ms` is 200 000 everywhere (the slice-1 constants make it so); the archived text and the main spec are corrected.
- Code (no requirement changes): serialised token writes per source pane, one transaction for the ask and its row, the answers port typed by the domain outcome, code-only failure causes in logs, a restart sweep that cannot abort, closed-lane dependencies required, the found/closed discriminated union, one unreadable-cause helper, file splits.

## Out of scope

The single window rule of the closed-lane store (SQL window flag against the domain rule) and the remaining slice-1 review items (primitive signatures waiting on the domain-type gates, duplicated locating keys, claim kind knowledge in compaction) stay tracked.
