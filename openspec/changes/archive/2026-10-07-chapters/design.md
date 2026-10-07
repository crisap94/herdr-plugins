# Design

## Context

`boundary (id, chapter_id, transcript_id, kind compacted|switched|rewritten, at, trigger auto|manual,
cursor, replaces_id)` and `chapter (id, tab_id, n, started_at)` exist, with `chapter_span` deriving each
chapter's end. Every tab has chapter 1 from 1.6.0. The readers return `Mark {kind, at, tokensBefore?,
tokensAfter?, tookMs?}` (compaction-feedback) per read; the `compaction` table holds the plugin-driven ones.
Transcripts are rows of `transcript` keyed by (tab, pane, source); a new session file in the same pane is a
new row with `attached = 1`.

## Decisions

### 1. Boundaries come from the reads

`boundaries.ts` (application) runs inside the recap job after each read: every `Mark` of kind `compacted`
newer than the lane's last boundary becomes a `boundary (kind compacted, trigger = manual when a compaction
record of the plugin started within 10 minutes before it, else auto, cursor = the read's end cursor)`; a new
transcript row in a pane that had one becomes `boundary (kind switched, replaces_id = the old transcript)`.
A boundary seals the tab's current chapter: `chapter n+1 (started_at = boundary.at)` is created in the same
transaction, and the run that follows belongs to it. Migration 008 adds `compaction.boundary_id` (nullable
FK) and the compaction flow sets it when its outcome is confirmed. Why hand-written: it is a fold over rows.

### 2. The timeline shows the breaks

`timeline.ts` merges boundaries into the fact list by time: `── compacted 800k → 14k · 16 s ──` (tokens from
the mark or the compaction record; `── compacted ──` when unknown), `── new session ──` for `switched`,
drawn in gray across the column. The session facts line becomes `compactions 2 (…) · chapters 3`.

### 3. The brief knows what is settled

`compaction_input.dtd`: `item` gains `settled (yes|no) "no"`: yes for facts closed before the last boundary
of the agent's lane. The brief's instructions: "facts marked settled are already in the agent's earlier
summaries; mention them in one line as settled, do not re-open them".

### 4. Retention

`TAB_RECAP_KEEP_DAYS` (default 30, `0` = keep forever): the daily upkeep deletes tabs whose `last_seen` is
older than that and that have no column open; facts, runs, inputs, verdicts, chapters, boundaries and
compaction records go with the tab by cascade. The deletion is one transaction per tab, logged with counts.
Retention never touches a tab seen in the last 30 days, whatever its size.

### 5. Documentation for 2.0

README (root and `tab-recap/README.md`): "What the recap is" rewritten around facts (column = open facts,
expanded view = the whole session), "How recaps are checked", the breaking note for custom writers, the four
jobs in Models, new keys in the settings table; screenshots regenerated with the screenshot script
(`column-en/es`, `bar-en`, `setup-en`, new `expanded-en`); ROADMAP: shipped 2.0, planned 2.1 (drop `item`,
per-fact editing). `CHANGELOG.md` is written by the release job (never by hand): the replay numbers go into
the merge request description, which the highlights are built from.

## Risks

- A compaction the plugin did not drive is only known at the next read: its boundary carries the mark's own
  time, so the timeline is right even when it is recorded late.
- opencode marks are fixture-tested only (no live opencode here); a missing mark means no boundary, nothing else.
