# Design

## Context

The flow (`src/recap/application/compaction.ts`) runs in the daemon: check the agent is free → refresh the
recap → write the brief (a job on the harness layer) → type the command → wait for the outcome
(`compaction-outcome.ts`: a 4 s pause, then status polls every 2 s, then the agent's records) → for Codex and
opencode, send the restore message. Feedback is three herdr toasts (`Notifier`). The column, the bar and the
modal are separate processes that only read the database.

Measured on herdr 0.9.0 (protocol 22), a throwaway Claude agent running `/compact`:

| time | herdr push | Claude's records |
| --- | --- | --- |
| 11:37:54 | `pane.agent_status_changed` → `working` | |
| 11:38:09 | `pane.agent_status_changed` → `done` | 11:38:09.49 `compact_boundary`, `compactMetadata: {trigger: manual, preTokens: 39532, postTokens: 3057, durationMs: 15588}` |

No `pane_updated` came: the hook's `SessionStart` report keeps the same session id, and its `source` is not
part of any event. Codex writes a `compacted` row and keeps writing `token_count` rows (context before and
after); opencode marks the compaction answer (`summary`, `mode: compaction`).

## Decisions

### 1. A compaction is a record (migration 004)

```sql
CREATE TABLE compaction (
  id            BLOB    NOT NULL PRIMARY KEY CHECK (length(id) = 16),   -- UUIDv7, shown as cmp_…
  tab_id        TEXT    NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  pane          TEXT    NOT NULL,
  agent         TEXT    NOT NULL,
  stage         TEXT    NOT NULL CHECK (stage IN ('briefing','compacting','restoring',
                                                  'compacted','failed','unconfirmed','skipped')),
  brief         TEXT    CHECK (brief IN ('written','template')),
  writer        TEXT,              -- "codex · gpt-6-luna · high": the job as it ran
  template_why  TEXT,              -- why the template was used
  started_at    INTEGER NOT NULL,  -- the stage clock starts here (epoch ms)
  stage_at      INTEGER NOT NULL,  -- when the current stage began
  finished_at   INTEGER,
  tokens_before INTEGER CHECK (tokens_before IS NULL OR tokens_before >= 0),
  tokens_after  INTEGER CHECK (tokens_after  IS NULL OR tokens_after  >= 0),
  took_ms       INTEGER,           -- the agent's own duration when it says (Claude), else stage time
  retried       INTEGER NOT NULL DEFAULT 0 CHECK (retried IN (0,1)),
  why           TEXT,              -- failed / skipped: the reason, in the operator's language
  dismissed_at  INTEGER,           -- the agent's next turn began: the lane stops showing it
  CHECK ((finished_at IS NULL) = (stage IN ('briefing','compacting','restoring'))),
  CHECK (brief IS NOT NULL OR stage IN ('skipped','briefing') OR template_why IS NULL)
) STRICT, WITHOUT ROWID;
CREATE INDEX compaction_by_lane ON compaction(tab_id, pane, started_at);
CREATE VIEW compaction_readable AS SELECT <id as text>, tab_id, pane, agent, stage, … FROM compaction;
```

A **`CompactionRecords`** port (`begin`, `advance(id, stage, fields)`, `finish(id, outcome)`,
`dismissTurn(tab, pane, at)`, `shownFor(tab)`) with one SQLite repository; every write is one transaction.
Rows go with their tab. The `boundary` table of the history release can point at these rows later.

**Interrupted flows:** when the daemon starts, every row still in `briefing`, `compacting` or `restoring`
becomes `unconfirmed` with `why` = "the daemon restarted", so no lane spins forever.

### 2. Stages and what each says

| stage | lane header (en) | colour | when |
| --- | --- | --- | --- |
| briefing | `✎ writing what to keep… (codex · gpt-6-luna · high) 0:08` | yellow | brief job running |
| compacting | `◐ compacting… 0:12` | yellow | command typed |
| restoring | `◐ telling it where things stand…` | yellow | Codex/opencode restore message sent, not yet answered |
| compacted | `✓ compacted 39.5k → 3.1k · 16 s` (`· template` in gray when the template was sent) | green | records confirm |
| failed | `✗ not compacted: <why>` | red | records say it failed (after the retry), or typing failed |
| unconfirmed | `? not confirmed — check it` | gray | the agent is free again, records say nothing |
| skipped | `– not compacted: working` | gray | the agent was busy |

The clock (`0:08`) counts from `stage_at`; the column already redraws on a timer. Token counts use the
same short form as the hint (`39.5k`, `1M`); a missing number is left out, never guessed. Spanish strings
in `es.ts`. While a record is shown, it takes the place of the `compact?` hint (they never stand together).

**Bar (phone):** the headline becomes the stage of the tab's newest shown compaction, prefixed with the
agent (`◐ compacting claude… 0:12`, `✓ claude compacted 39.5k → 3.1k`); otherwise the usual headline.
**Modal:** the same lane header as the column.

### 3. How long it stays

In-progress stages show until they end. An ended record shows until the agent's **next turn**: the
daemon sets `dismissed_at` on the first `working` push for the lane that starts after `finished_at`. The
flow's own turns do not count: for Codex/opencode the record is finished only after the restore message's
answer (the agent is waited for, up to 2 minutes, then it is finished anyway). A newer compaction of the
lane replaces the shown one.

### 4. The outcome comes from herdr's push

`outcomeOf` waits on a **`LaneSettling`** port: `settled(pane, since, timeoutMs)` resolves with the first
`idle`/`done` status for the pane after `since`. The informer, which already receives
`pane.agent_status_changed` for every lane, feeds it. While the informer is blind (no subscription), the
port falls back to today's status polling (every 2 s). After the push, the records are read at once, and up
to three more times 300 ms apart when they show nothing yet (the agent may still be flushing the file).

Mark readers return what the records say: Claude `compact_boundary` → `tokensBefore = preTokens`,
`tokensAfter = postTokens`, `tookMs = durationMs`; Codex `compacted` → before = the last `token_count`
before it, after = the first one after it (when present); opencode → the compaction message's token counts
when present. `Mark` gains these optional fields.

### 5. Toasts

Two per compaction: when it starts (`Writing what claude should keep…`, or `Compacting claude` when no
brief is written) and when it ends (with the numbers: `claude compacted: 39.5k → 3.1k tokens in 16 s`). A
skip or a failure is one toast at the end. The middle toast goes.

### 6. Forbidden words are relative to the conversation

`vetted(answer, own)` refuses `recap`, `tab`, `plugin` or `herdr` (and their plurals) only when that word
does not appear in `own`: the agent's own text in the brief's input (its recent turns and the session
history items). `tab-recap` and `recap column` stay refused unless the conversation itself contains them.
The template obeys the same rule (it is built from recap items that may carry those words). The spec's
requirement changes accordingly.

### 7. Layout

- `src/ports/compaction-records.ts`, `src/adapters/db/compaction-records.ts`,
  `src/adapters/db/schema/004-compaction.ts` (+ `index.ts`).
- `src/ports/lane-settling.ts`; the informer gains a settle hub (`src/recap/application/settle-hub.ts`).
- `src/recap/application/compaction.ts` writes stages; `compaction-outcome.ts` waits on `LaneSettling`
  and returns `{outcome, tokensBefore?, tokensAfter?, tookMs?}`.
- `src/recap/render/compaction-stage.ts` (pure: record + now → header text and colour);
  `present.ts` uses it in the lane header and the bar.
- Files ≤ 150 lines, functions within oxlint's limits; new nouns (**Compaction record**, **Stage**) go into
  `CONTEXT.md` first.

## Risks

- A Claude version that drops `compactMetadata`: the record still confirms, the numbers are left out.
- herdr may push `done` before the records are flushed: the short re-reads cover it; else `unconfirmed`.
- The `working` push that dismisses could be the agent's own follow-up after `/compact` (Claude does not
  start one; Codex is covered by the restore wait).
