# Proposal

## Why

The full-screen view (Enter or a tap on the column, `tab-recap.show`) shows exactly what the column shows,
only wider. The operator asked for the opposite: when there is room, show more of the session — everything
that happened, decisions with their reasons, how long each question has waited, the facts of the session
(2026-10-07). With the ledger of facts (`fact-ledger`) that view needs no model call: it is a different
rendering of the same rows.

## What Changes

- The full-screen view becomes the **expanded view**: Goal · Now · Needs you (each with how long it has
  waited) · Timeline (done and closed facts, newest first, with their times) · Decisions with their why · Next
  · Rules · Links · Session facts. From 140 cells wide it is two columns (story on the left, reference on the
  right); narrower, one column in that order. It opens at once from the ledger.
- **Session facts** are computed, never written by a model: when the tab started and for how long, turns per
  cause, compactions with their tokens (from the compaction records), each agent's context share, repository
  and branch, the files touched most.
- A **Curator** job, on the harness layer with its own Models row (default: the writer's harness, medium
  effort), runs when the expanded view opens and the ledger changed since the curator last ran: it closes
  leftover near-duplicates as merged and writes a "session so far" paragraph (at most 120 words) shown at the
  top of the view. The view never waits for it; it shows "updating…" and redraws when done.
- The column, the bar, the keys, en/es and the phone's one-column layout are unchanged.

Out of scope: chapter breaks in the timeline and retention (next change); editing facts by hand.

Merge request label: `changelog::added`.

## Capabilities

### New Capabilities

- `tab-recap/expanded-view`: the view, its layout, session facts, the curator job.

### Modified Capabilities

_None._

## Impact

`src/recap/render/expanded.ts`, `timeline.ts` (new, pure), `src/recap/domain/session-facts.ts` (pure),
`src/recap/application/expanded-view.ts`, `curate.ts`, `schema/curator-input.dtd`, `src/column/main.ts`
(modal mode draws the expanded view), `src/daemon/config.ts` (curator job), the settings modal (one Models
row), migration 007 (`task.story_text`, `task.story_at`), en/es, README, screenshots, tests.
