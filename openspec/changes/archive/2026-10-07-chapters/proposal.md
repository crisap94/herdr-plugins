# Proposal

## Why

A session has breaks: an agent compacts its context, or a new transcript starts in the same pane. The
`boundary` and `chapter` tables have existed since 1.6.0 to record them and have never been filled; the
timeline of the expanded view (`expanded-view`) cannot show where a compaction happened, and the compaction
brief cannot say what the agent has already forgotten. Facts also accumulate without end: nothing removes a
closed tab's data.

## What Changes

- **Boundaries are recorded** from the agents' own marks (Claude `compact_boundary`, Codex `compacted`,
  opencode's compaction answer) and from a new transcript appearing in the same pane (`switched`); the
  compaction records of `compaction-feedback` link to the boundary they caused. A boundary seals the chapter
  and starts the next.
- The expanded view's **timeline shows a break line per boundary** (`── compacted 800k → 14k ──`,
  `── new session ──`), and the session facts count chapters.
- The **compaction brief** names, after the note and the goal, the facts closed before the last boundary as
  "already settled", so the agent's summary does not re-open them.
- **Retention:** a closed tab's facts, runs, inputs and verdicts are removed `TAB_RECAP_KEEP_DAYS` (default 30)
  after it was last seen; a daily upkeep step.
- The 2.0 **documentation**: README sections and screenshots regenerated, ROADMAP updated, the replay report
  of `fact-ledger` summarised in the changelog's highlights.

Out of scope: dropping the 1.x `item` table (2.1); chapters for the column (it shows the open facts).

Merge request label: `changelog::added`.

## Capabilities

### New Capabilities

- `tab-recap/session-chapters`: boundaries, chapters, the timeline's breaks, retention.

### Modified Capabilities

- `tab-recap/expanded-view`: timeline breaks and the chapter count in the session facts.
- `tab-recap/agent-compaction`: the brief marks facts settled before the last boundary.

## Impact

`src/recap/application/boundaries.ts` (new), the readers' marks (already carry times and tokens), the
`boundary` repository (`src/adapters/db/boundaries.ts`), `compaction` → `boundary` link (migration 008),
`render/timeline.ts`, `session-facts.ts`, `compaction-input.ts` (+ DTD attribute `settled`), the daemon's
upkeep (retention), README, `docs/screens/*`, ROADMAP, tests.
