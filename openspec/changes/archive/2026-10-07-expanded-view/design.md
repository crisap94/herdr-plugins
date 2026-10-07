# Design

## Context

`src/column/main.ts` runs in three modes (`column`, `bar`, `modal`); the modal is the column's renderer over
the whole tab. `present.ts` draws a `ColumnView` from a `TabRecap`; `text-layout` wraps by terminal cells.
`LaneContexts` knows each lane's token use and window; the `compaction` table (compaction-feedback) holds
tokens before/after and durations; `LaneRepo` gives repository and branch; the readers report `edit` tool
calls per file (lane hints). The ledger gives facts with times, whys and states.

## Decisions

### 1. The view is a pure layout of ledger rows (`src/recap/render/expanded.ts`)

Input: `ExpandedView {tasks: [{goal, now[], needs[], timeline[], decisions[], next[], rules[], links[]}],
session: SessionFacts, story: {text, at} | null, curating: boolean, width, messages, style, now}`.

| region | content |
| --- | --- |
| head | the curator's paragraph with its time, or "updating…" while curating; nothing when neither |
| Goal | the open goal fact |
| Now | open `now` facts, newest first, with the agent label when several |
| Needs you | open `needs` facts, **oldest first**, each with `waiting 25 min` (now − first_at, relative-time rules) |
| Timeline | `done` facts (open and closed) and every closed fact of other sections, newest first, `HH:MM text` (`· closed: why` in gray for closed non-done facts); date lines when the day changes |
| Decisions | open and closed decisions newest first: `HH:MM text` then the why indented on the next line |
| Next | open `next` facts, newest first |
| Rules | open `rules` facts |
| Links | open `links` facts as hyperlinks (recap-links rules) |
| Session | the session facts (decision 2) |

Two columns from `EXPANDED_TWO_COLUMNS = 140` cells: left = head, Goal, Now, Needs you, Timeline; right =
Decisions, Next, Rules, Links, Session; each column `(width − 3) / 2` cells, a one-cell gray `│` gutter;
rows are zipped line by line so scrolling moves both. Below 140: one column in the order Goal, Now, Needs
you, Decisions, Timeline, Next, Rules, Links, Session. Headings are the column's headings; every string en/es.
Scrolling, `q`/Esc, `r`, `c`, `s` keep their meaning; `j/k`, Space/`b`, `g/G` scroll the zipped rows. No
truncation of the timeline: it is the whole ledger. Why hand-written: the terminal has no layout engine; the
zip and the cell maths reuse `text-layout`.

### 2. Session facts (`src/recap/domain/session-facts.ts`, pure)

```
started 09:12 · 6 h 12 min          turns 41 (turn 36 · focus 3 · asked 2)
compactions 2 (800k → 14k · 39k → 3k)
claude · orchestrator  34 % of 1M   codex · host  12 % of 272k
repo herdr-plugins · branch atalaya
files src/recap/application/compaction.ts (7), src/recap/render/present.ts (5), …
```
Inputs: `tab.first_seen`, `now`; runs by cause for the tab; compaction records (tokens before → after);
`LaneContexts` (tokens, window); `LaneRepo`; edit-call counts per file from the readers' lane hints, top 5.
Missing inputs leave their line out, never show a guess.

### 3. The curator is a job (`src/recap/application/curate.ts`)

Config `TAB_RECAP_CURATE_BY/_MODEL/_EFFORT` (defaults recap · '' · medium), one Models row, en/es. Input
`curator_input` (`schema/curator-input.dtd`): the task, every fact of the ledger (open and closed, with
states, whys and times), the rubric's item checks. Answer: `{"ops":[{"op":"close","id":"f7","why":"merged",
"into":"f3"}, …], "story":"…"}`; only `close … merged` operations are accepted (anything else refused and
logged), the story ≤ 120 words, forbidden words checked as the brief's are (the operator reads it, so the
plugin words are allowed here; the check is only for an agent reading it — not applied). Stored in
`task.story_text`, `task.story_at` (migration 007) with the ops in one transaction. Trigger: the column
process in modal mode asks the daemon (a `curate` request in the `request` queue, kind added by migration 007)
when `story_at` is older than the ledger's newest `last_at`; the daemon runs one curator call per task, at
most once per 5 minutes per task. The view redraws from the store on its tick; the daemon notifies nothing.

### 4. Timeline order and times

Facts are ordered by `closed_at` for closed facts and `last_at` for open done facts; a fact's drawn time is
`first_at` for done (when it happened) and `closed_at` for a closed non-done fact (`· closed: wrong`). Times
follow the relative-time spec (HH:MM today, date lines otherwise, the tab's zone).

### 5. Migration 007

```sql
ALTER TABLE task ADD COLUMN story_text TEXT;
ALTER TABLE task ADD COLUMN story_at INTEGER;
-- request.kind gains 'curate' (table rebuild, as migration 003 did)
```

## Risks

- A very long ledger makes the timeline long: scrolling handles it; the curator's merges keep it tidy.
- The curator closing a fact wrongly as merged: only `merged` is accepted, the fact stays in the story with
  its reason, and `eval` judges curated tabs like any other.
