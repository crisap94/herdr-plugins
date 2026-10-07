# Design

## Context

The recap writer is one harness call per run (`Harness.run({instructions, input}, {model, effort})`); its
answer goes through `recap-ask.ts` (`judge()` checks shape, language and task regrouping, with one
correction retry) and `recap-shape.ts` (caps, 16 words). The compaction brief is a second job on the same
layer with its own harness · model · effort row in the settings. Runs are rows of `run`; their input document
is not kept. Node built-ins in reach: `node:zlib` (gzip), `node:sqlite`, `Intl.Segmenter` (word counts),
`util.parseArgs` (the `eval` options).

## Decisions

### 1. The rubric is one Markdown file, quoted by every job

`tab-recap/schema/recap-rubric.md` holds the checks below, each with a one-line definition, a pass example and
a fail example. The writer's instructions, the judge's instructions and (later) the curator's embed its
"Every item" and "Per section" parts verbatim at build time (`readFileSync` of the file next to the DTDs, as
the DTDs are read in tests); the golden `test/fixtures/instructions-en.txt` therefore changes. One source, so
the writer is asked for exactly what the judge checks.

| id | every item passes when |
| --- | --- |
| I1 atomic | it states one fact, action or decision |
| I2 stands alone | it is understood without the transcript: no unresolved it / this / that / the issue |
| I3 specific | it names a file, command, reference, value, version, error or person-role |
| I4 supported | the run's input contains what it says |
| I5 about the work | the subject is the work, never the agent or the plugin |
| I6 new | it is not a rewording of another item kept in the same recap |
| I7 still true | nothing later in the input contradicts it |

| section | passes when |
| --- | --- |
| goal | an outcome the operator wants, not an activity; changes only when the operator changes it |
| now | an activity in progress at recap time (with the agent's label when several) |
| needs | the operator can answer it: a question or a choice, and what it blocks |
| done | a checkable result (an artifact, a number, a state), not effort |
| decisions | the choice and its why (and the rejected option when there was one); not a done item |
| next | an action with its object, that an agent can start |
| rules | a standing instruction of the operator, valid beyond the current step |
| links | a reference that resolves (`!n`, `#n`, a SHA, a branch, a path, a URL) |

Whole recap (judge only): coverage = the share of the judge's key facts present; no-filler = the share of
items tied to a key fact. Read-back (judge only): six fixed questions answered from the recap alone and
graded against the input — goal, what finished, waiting on the operator, what must not be done, why ⟨a
decision among the key facts⟩, next action.

### 2. Gates are pure functions, one file each, under `src/recap/domain/gates/`

| gate | rule | outcome |
| --- | --- | --- |
| G1 narrator | the first words are an agent label or kind of the tab, or "the agent", followed by a verb | refuse |
| G2 duplicate | within the answer: token Jaccard ≥ 0.6 with another item of the same task (tokens: lower-cased words ≥ 3 letters, `Intl.Segmenter`) | refuse the later one |
| G3 decision without why | section `decisions` and no reason clause (no `because / so that / since / to / instead of / rather than`, `:` or `—` followed by a clause; Spanish equivalents) | refuse |
| G4 link | section `links` and not `!n`, `#n`, a hex SHA ≥ 7, a `name/with-slash`, a path with `/` or a dot-extension, or a URL | refuse |
| G5 language | the existing language check | refuse (as today) |
| G7 length | > 16 words (text) | clip with `…` (as today) |
| G8 not specific | nothing of I3's list | flag |
| G9 pronoun opener | opens with it / this / that / the issue / the bug / the problem (es: eso / esto / el problema) | flag |

`gatekeeper.ts` runs them over the shaped answer, builds the correction (one line per refused item: the
gate's reason in the writer's language, the item quoted) and reports `GateStats {refused: {gate: n},
flagged: {gate: n}, dropped: n}`. Flow in `recap-ask.ts`: shape → gates → refused? correction retry (the one
retry that exists) → still refused items dropped, the rest kept; the run is stored with the stats
(`run.gate_stats`, JSON). Why hand-written: no Node built-in classifies text; the rules are a few regular
expressions and a set intersection.

### 3. Every run's input is saved, compressed, with retention (migration 005)

```sql
CREATE TABLE run_input (
  run_id   BLOB NOT NULL PRIMARY KEY CHECK (length(run_id) = 16) REFERENCES run(id) ON DELETE CASCADE,
  document BLOB NOT NULL,            -- the recap_input XML, gzip (node:zlib)
  bytes    INTEGER NOT NULL CHECK (bytes > 0)   -- uncompressed size
) STRICT, WITHOUT ROWID;
ALTER TABLE run ADD COLUMN gate_stats TEXT;    -- JSON, null for runs before this change
```
Written in the run's transaction. `TAB_RECAP_KEEP_INPUT_DAYS` (default 14, `0` = never keep): the daemon's
upkeep deletes older rows once a day. A run whose input was deleted can still be listed by `eval`, not judged.

### 4. Verdicts are stored (migration 005)

```sql
CREATE TABLE verdict (
  id       BLOB NOT NULL PRIMARY KEY CHECK (length(id) = 16),     -- UUIDv7, prefix vrd
  run_id   BLOB NOT NULL CHECK (length(run_id) = 16) REFERENCES run(id) ON DELETE CASCADE,
  item_key TEXT,                      -- "<task>/<section>/<position>" of the judged item; NULL for run-level checks
  check_id TEXT NOT NULL,             -- I1…I7, S-<section>, coverage, filler, readback-<n>
  pass     INTEGER NOT NULL CHECK (pass IN (0,1)),
  critique TEXT,                      -- one line, present when pass = 0
  judge    TEXT NOT NULL,             -- "claude · sonnet · medium"
  at       INTEGER NOT NULL,
  source   TEXT NOT NULL CHECK (source IN ('judge','operator'))
) STRICT, WITHOUT ROWID;
CREATE INDEX verdict_by_run ON verdict(run_id, check_id);
```
Operator labels (`eval --label`) are rows with `source = 'operator'`, so agreement is a join. Backup
`tab-recap.db.v4.bak` before the migration, as every migration does.

### 5. The judge is a job on the harness layer

`judgeOf()` in config: `TAB_RECAP_JUDGE_BY` (`recap` = the writer's harness, default) · `TAB_RECAP_JUDGE_MODEL`
(empty = the writer's) · `TAB_RECAP_JUDGE_EFFORT` (default `medium`). One row in the settings' Models group,
en/es, like the brief. Input: one `judge_input` document (`schema/judge-input.dtd`): the rubric text, the
run's `recap_input` (as saved), the items the run produced with their keys. Answer, JSON only:
`{"verdicts":[{"item":"…","check":"I1","pass":true|false,"critique":"…"}], "keyfacts":["…"],
"coverage":[{"keyfact":0,"item":"…"|null}]}`. A second call per sampled run does the read-back: instructions
with the six questions, input = the recap items only; a third grades the answers against the input. Shape
checked like the writer's answer; an unparsable answer is one failed run in the report, never an exception.

### 6. `tab-recap eval` (bin subcommand, `util.parseArgs`)

- `eval [--sample N] [--tab <id>] [--since <days>]` (default 20 runs, newest first, with a saved input):
  judges, stores verdicts, prints a table: check → pass rate, then every failing item with its critique,
  coverage and no-filler per run, read-back per run. Exit 0; 1 when the judge job is not available.
- `eval --label N`: prints N items (newest, not yet labelled) with their run, asks pass/fail and a reason per
  item on the terminal (`readline`), stores them as operator verdicts for I1–I7 and the section check.
- `eval --agree`: for every check with both sources, agreement %, false passes and false fails counted,
  target ≥ 85 % shown beside each.
- `eval --gates [--since <days>]`: gate statistics from `run.gate_stats`, no model call.
Output is plain text with the same `plain`/`coloured` style rules as the column; `--json` prints the report.

### 7. What does not change

The recap's shape, caps, sections, the column, the bar, the modal, the compaction brief; `TAB_RECAP_CUSTOM_CMD`
(still the v1 document and the recap JSON — the gates apply to its answer too).

## Risks

- Gates on a free-form writer may refuse more than the writer can fix in one retry: the drop keeps the run
  useful; `eval --gates` shows the rate, and the thresholds (G2's 0.6) are constants in one file.
- G3 by reason-clause words is a heuristic; the judge's `S-decisions` check is the real measure.
- The judge on the writer's own harness may favour the writer's wording (self-preference); `eval --agree`
  against the operator's labels is the guard, and the job row lets another harness be chosen.
