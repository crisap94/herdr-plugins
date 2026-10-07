# Design

## Context

After `recap-rubric`: the writer still answers a whole recap (`{goal, now[], …}`), shaped and gated, stored as
`run` → `run_task` → `item` rows; `recap-records.ts` reads the last good run per tab for the column and
`readHistory` folds items across runs for the compaction brief. `task` rows already give a stable identity per
task of a tab; `chapter` and the empty `boundary` table exist from 1.6.0. Ids are UUIDv7 BLOBs with TypeID
prefixes.

## Decisions

### 1. The fact (domain, `src/recap/domain/fact.ts`)

```ts
interface Fact {
  id: FactId; task: TaskId; section: Section;        // goal · now · needs · done · decisions · next · links · rules
  text: string;                                       // ≤ 16 words, one line
  why: string | null;                                 // ≤ 24 words; required for decisions and for close
  ref: string | null;                                 // a reference the text is about (!n, #n, SHA, path, URL)
  agent: string | null;                               // the lane's label when the fact is one agent's
  firstAt: number; lastAt: number;                    // epoch ms
  state: 'open' | 'closed';
  closedWhy: 'done' | 'wrong' | 'superseded' | 'answered' | 'merged' | 'rewritten' | null;
  closedAt: number | null;
  language: string;
}
```
`goal` is one open fact per task (an `add` to `goal` closes the previous one as `superseded`). A `done` fact
is open while it is worth showing; it is closed `merged` or `superseded` by later operations, never by age —
the column's caps hide old ones, the story keeps them. `firstAt` = the `at` the writer gives (a time of the
turn, `HH:MM` in the tab's zone, resolved to the nearest turn time in the run's window) else the run's time.

### 2. Operations (domain, `src/recap/domain/ops.ts`)

The writer's answer: `{"ops":[…]}` with
`{"op":"add","section":"done","text":"…","why":null,"ref":"!34","at":"16:41","agent":"a1"}`,
`{"op":"update","id":"f12","text":"…","why":"…"}`, `{"op":"close","id":"f3","why":"done"}`.
Ids in the document are `f1…fn` (an XML `ID`, like agents `a1…`), mapped to fact ids per run. Applying ops is a
pure fold `apply(ledger, ops, run) → {ledger, refused}`: unknown id, update of a closed fact, close of a closed
fact and a second `goal` add in one answer are refused with a reason. Order inside an answer: closes, then
updates, then adds (so a close+add pair never reads as a duplicate).

### 3. Gates on operations (`recap-quality`, extended)

G2 duplicate now compares an `add` with the **open facts of the task** in the ledger (Jaccard ≥ 0.6) and with
facts closed in the last 24 h (≥ 0.8), and names the id to `update` instead; G6 unknown id; G10 `close` without
a why. The retry/drop flow is unchanged. `gate_stats` gains the new gates.

### 4. The document, version 2 (`schema/recap-input.dtd`)

```dtd
<!ELEMENT recap_input (tab, current_tasks?, ledger, agent_note*, transcript+, correction?)>
<!ATTLIST recap_input version CDATA #FIXED "2">
<!ELEMENT ledger (fact*)>
<!ATTLIST ledger task CDATA #IMPLIED>
<!ELEMENT fact (#PCDATA)>
<!ATTLIST fact id ID #REQUIRED  section (goal|now|needs|done|decisions|next|links|rules) #REQUIRED
  state (open|closed) "open"  first CDATA #IMPLIED  last CDATA #IMPLIED  why CDATA #IMPLIED
  ref CDATA #IMPLIED  agent IDREF #IMPLIED  closed (done|wrong|superseded|answered|merged|rewritten) #IMPLIED>
```
Open facts of every task of the tab, plus facts closed in the last two hours (state `closed`, with `closed`),
newest last. With several tasks the `current_tasks` element stays and each `<ledger task="t1">` is separate.
The instructions change: "answer operations on `<ledger>`: add what is new, update what changed, close what
finished (`done`), was wrong (`wrong`), was replaced (`superseded`) or was answered (`answered`); never
re-add a fact that is in the ledger". The rubric quote stays. `correction` lists refused ops with the reason.

### 5. Ledger storage (migration 006; `src/ports/ledger.ts`, `src/adapters/db/ledger.ts`)

```sql
CREATE TABLE fact (
  id         BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),          -- UUIDv7, prefix fct
  tab_id     TEXT NOT NULL REFERENCES tab(id) ON DELETE CASCADE,
  task_id    BLOB NOT NULL CHECK (length(task_id) = 16) REFERENCES task(id) ON DELETE CASCADE,
  section    TEXT NOT NULL CHECK (section IN ('goal','now','needs','done','decisions','next','links','rules')),
  text       TEXT NOT NULL CHECK (length(text) > 0),
  why        TEXT, ref TEXT, agent TEXT,
  first_at   INTEGER NOT NULL, last_at INTEGER NOT NULL CHECK (last_at >= first_at),
  state      TEXT NOT NULL CHECK (state IN ('open','closed')),
  closed_why TEXT CHECK (closed_why IN ('done','wrong','superseded','answered','merged','rewritten')),
  closed_at  INTEGER,
  born_run   BLOB NOT NULL CHECK (length(born_run) = 16) REFERENCES run(id),
  last_run   BLOB NOT NULL CHECK (length(last_run) = 16) REFERENCES run(id),
  language   TEXT NOT NULL,
  CHECK ((state = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((state = 'closed') = (closed_why IS NOT NULL)),
  CHECK (section <> 'decisions' OR why IS NOT NULL)
) STRICT, WITHOUT ROWID;
CREATE INDEX fact_by_task ON fact(task_id, state, section, last_at);
CREATE TABLE fact_turn (
  fact_id       BLOB NOT NULL CHECK (length(fact_id) = 16) REFERENCES fact(id) ON DELETE CASCADE,
  transcript_id BLOB NOT NULL CHECK (length(transcript_id) = 16) REFERENCES transcript(id) ON DELETE CASCADE,
  at            INTEGER NOT NULL,
  PRIMARY KEY (fact_id, transcript_id, at)
) STRICT, WITHOUT ROWID;
CREATE VIEW fact_readable AS SELECT <id as text>, tab_id, <task_id as text>, section, text, why, ref, agent, first_at, last_at, state, closed_why, closed_at FROM fact;
CREATE VIEW open_facts AS SELECT * FROM fact WHERE state = 'open';
```
`Ledger` port: `openOf(task)`, `recentlyClosed(task, sinceMs)`, `apply(run, ops) → Applied`, `allOf(task)`,
`historyOf(tab, pane)` (replaces `readHistory`). One transaction per run: the run row, `run_read`,
`run_input`, the ops. The `item` table is no longer written; `run_task` keeps the task list and name per run.

### 6. Import of 1.x items (inside migration 006, after backup `.v5.bak`)

Per task, in run order: normalise each item (lower-case, punctuation out, whitespace folded); the first
occurrence creates a fact (`first_at` = that run's `at`, `born_run`), a later equal item moves `last_at` /
`last_run`; items of the task's last good run are `open`, every other fact is `closed` with `closed_why =
'rewritten'`, `closed_at` = the first run that no longer carried it. `why` of an imported decision = the part
after the first `:` or `—` when there is one, else the text's reason clause, else `"(not recorded)"` (so the
CHECK holds and the gap is visible). Goal: the last good run's goal open, earlier distinct goals closed
`superseded`. The import is a pure function over rows (`import/items-to-facts.ts`) with the live database's
item set as a fixture (private text replaced), and is checked by the migration test: every task's column
after the migration equals its column before (same open items per section, same order).

### 7. Readers of the ledger

- Column / bar / modal: `recap-records.readRecap(tab)` builds today's `TabRecap` from open facts: per task and
  section, newest `last_at` first, capped as today (now 3, needs 3, done 5, decisions 3, next 5, links 6,
  rules 5); `goal` = the open goal fact. Decisions render `text` (the why is for the expanded view).
- Compaction brief: `historyOf` returns every fact of the agent's tasks (open and closed, with why and dates)
  instead of folded items; `compaction_input.dtd`'s `item` gains `state`, `why`, `closed`. The brief's
  forbidden-word check is unchanged.
- The bar's headline rule is unchanged (first open `now`, else `needs`, else goal).

### 8. `eval --replay <transcript-file> [--kind claude|codex] [--tab <label>]`

Reads a transcript file from the start with the real reader, in windows of one turn, runs the extractor for
every window against a scratch ledger in a temporary database (never the live one), then judges the facts
with the judge job and prints the same report as `eval --sample`, plus the final ledger. With
`--compare-imported <tab>` it prints the same checks over the imported facts of that tab side by side. This is
the 2.0 acceptance measure.

### 9. Breaking change for custom writers

`TAB_RECAP_CUSTOM_CMD` receives the version 2 document and must print `{"ops":[…]}`. The README's "Your own
command" section documents both; a custom command that still answers the recap JSON is refused with a log
line naming the contract. There is no compatibility shim: the recap JSON has no ids to operate on.

### 10. What stays hand-written and why

The ops fold, the Jaccard, the import normaliser: no Node built-in does them; each is under 60 lines and pure.
XML is produced by the existing serializer; words by `Intl.Segmenter`; times by `Intl.DateTimeFormat`.

## Risks

- A low-effort writer may struggle with ids: unknown ids are refused and counted (`eval --gates`); the replay
  shows the rate before 2.0, and the effort of the writer job can be raised in the settings.
- Facts that should close but never do (the writer forgets): the column's caps hide them, the story shows
  them, and the curator (next change) closes leftovers `merged`.
- The import's open/closed split follows the last good run; a tab whose last run failed shows its previous
  good run, as today.
