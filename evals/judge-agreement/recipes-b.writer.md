# Part B recipe: eval `writer` (WJ1, WJ2, WJ3, WJ4)

This file tells a writer how to write the planted answers of Part B for the four judge criteria of `evals/writer`. Read `SPEC.md` section 7 and section 3 first. All data is mocked. Do not read the owner's recap store or any real transcript. Do not call codex.

Plan: 20 breached answers per criterion (80) and 5 clean answers. That is 85 rows of `dataset-b.jsonl` with `eval` set to `writer`.

## 1 What the judge sees, and what that means for a planted answer

The judge gets `JUDGE_CRITERIA` of `evals/writer/judge-criteria.ts` and `view(item, text)` of `evals/writer/scoring.ts`. Read both before writing.

- The `answer` part of the view holds only the **kept** operations: the ones no gate and no ledger rule refused. A refused operation never reaches the judge. So every planted answer must have **zero refusals**. A breach the gates catch is not a breach the judge sees.
- Each kept add or update is shown as one line: `add | section | text | why | anchor`. The judge reads the `why` and the `anchor` too.
- The `case` part holds the transcript, the ledger facts the item names, the 5 open ledger facts closest to each kept add, the key facts (with the reason of each decision), and the claims the input does not support (`refuted`, `not_established`).
- Which criteria apply comes from `judgeApplies(item, text)`: WJ1 only on the 16 items with `expected.quiet` false; WJ2 and WJ4 when the answer keeps an add or an update; WJ3 when it keeps an add.

Gates that matter when you write a breach:

- G1 refuses an item whose text opens with an agent name and a verb: `agent`, `the agent`, `the assistant`, `the model`, `the plugin`, and the item's own agent id, label and kind (`claude` or `codex`). So `Claude ran ...` and `The agent ran ...` are refused. `I ...`, `We ...`, `The coding agent ...`, `Claude Code ran ...` and `The Edit tool ...` are kept (checked).
- G2 refuses an add whose word overlap (`jaccard`) with an open ledger fact or an earlier add of the answer is 0.6 or more. `links` items are not compared with other items.
- G3 and the ledger refuse a `decisions` item with no reason. A `decisions` add with `why: null` is refused (rule `L`), even when the text holds a reason word. A `done` item is never checked for a reason.
- G9 only flags an item that opens with `It`, `This`, `That`, `The issue`. A flag does not refuse, so the item stays kept.
- G11 refuses an add whose `anchor` is not copied exactly from the input (at most 120 characters). Copy anchors from the transcript, or reuse the `span` of a key fact or of `already_in_ledger`.

## 2 Source items

Non-quiet items (WJ1 applies): `writer-01`, `-02`, `-03`, `-04`, `-05`, `-06`, `-11`, `-12`, `-13`, `-14`, `-15`, `-17`, `-18`, `-19`, `-20`, `-21`.

Quiet items (WJ1 is `open`): `writer-07` to `-10`, `-16`, `-22` to `-24`. Use them only where section 4 says so.

Do not use `writer-02`. Its reference answer keeps `done: chartkit is upgraded from 4.2.1 to 4.3.0 ...` beside `links: !57 upgrades chartkit to 4.3.0`. A careful reader could call that a pair, so its WJ3 label is not clear.

Items with a decision key fact: `-05` (k1), `-11` (k1), `-12` (k2), `-13` (k1).
Items with an update key fact (`via_update_of`): `-03` (k4, f95), `-06` (k1, f294), `-21` (k1, f40).
Items with a refuted claim: `-19`, `-20`.
Items with optional facts: `-11`, `-17`, `-18`.
`-21` keeps no add in its reference answer, so WJ3 is `open` there unless the answer adds something.

Read the item's transcript before you write: `view(item, text).case`, or `documentOf(item)` from `evals/writer/prompt.ts`. Never state anything the transcript does not state, unless that is the breach.

## 3 The clean answer

A clean answer passes all four judge criteria and every code criterion.

1. Start from `item.expected.reference_ops`. It parses, passes every gate and every code criterion (checked by `check-dataset.ts`).
2. Keep every key fact as one item, with every detail of its reference `text`: numbers, file names, commit, branch, "not pushed yet", "not merged".
3. A decision goes in section `decisions` with its reason in `why`, as the key fact gives it.
4. Write each item with the work as its subject. Name the thing. No `I`, `we`, agent or tool as subject. No `it`, `this`, `that`, `the change`, `the issue` without its noun in the same item.
5. No two kept items may say the same thing. When a decision and a `done` item touch the same code, the decision gives the choice and its reason, the `done` item gives the file and the test result.
6. Add nothing beyond the key facts, the closes and the updates of the reference. No extra `links` items.
7. Keep the closes of the reference (`must_close`) and close nothing in `must_stay`.

Use these 5 items: `writer-01`, `-04`, `-14`, `-18`, `-20`. Their reference answers pass every code criterion with no refusal (checked). Ids `jb-writer-clean-01` to `-05`.

Every breached answer below is built the same way, then changed in exactly one place. Code criteria may fail on a breached answer when the breach itself causes it (for example W10 when a decision loses its reason, W4 on a quiet item). Gates may not refuse anything.

## 4 Breaches, per criterion

Subtle means: a careful human reader calls it a breach without doubt, but it is not flagged by the wording alone. In each criterion, 10 rows are obvious and 10 subtle.

A breach of one criterion must leave the other three clean:

- WJ1 breach: every kept item is still supported, distinct and self-contained.
- WJ2 breach: every key fact is still carried in full. Put the false claim either as a clause added to the key-fact item that already names its subject, or as an extra item on a subject no other item covers. Never on a subject that another item states in other words (that would also be a WJ3 pair).
- WJ3 breach: both items of the pair are supported by the transcript and self-contained, and every key fact is still carried.
- WJ4 breach: the item still states its fact, and the key fact it carries keeps all its own nouns. Put an unresolved pronoun on an extra supported item, or on a part of the item the key fact does not need.

### WJ1: every key fact is carried

What it asks: each key fact is stated by one kept item, and a decision counts only if its item also gives the reason.

| Way | How | Items | Rows | Subtlety |
|---|---|---|---|---|
| A. Drop a key fact | Leave out the one item that carries a key fact. Keep the rest exact. | `-01` (k2), `-03` (k3), `-04` (k5), `-05` (k6), `-06` (k4), `-19` (k3) | 6 | obvious |
| B. Decision without reason, moved out of `decisions` | Write the decision in section `done` with `why: null` and no reason in the text. (A `decisions` add with no `why` is refused, so it must move.) | `-05` (k1), `-11` (k1), `-12` (k2), `-13` (k1) | 4 | obvious |
| C. Decision whose `why` only restates the choice | Keep it in `decisions`. Give a `why` that repeats the decision in other words and gives no reason, such as `HALF_UP is the rounding mode chosen for invoice lines`. The `why` must not state another cause (that would be WJ2). This passes every gate and W10 (checked). | `-05`, `-11`, `-12`, `-13` | 4 | subtle |
| D. The item is there, the key fact's content is not | Either close the old fact instead of updating it, so the new state is never stated (`-03`: `close f95 superseded`, no item for k4; `-06`: `close f294 superseded`, no new goal), or keep the topic and drop the result (`-05` k3 `March sample re-run is done`, `-04` k3 `Replay of 02:50 to 03:10 was run`, `-12` k4 `Bundle size was measured with the sparkline`, `-19` k1 `Free space on /var of gauge-7.test was checked`). | `-03`, `-06`, `-05`, `-04`, `-12`, `-19` | 6 | subtle |

Evidence: `answer: none` and the key fact missing, or the quoted item that falls short. Then the key fact id and its text, or its reason. Example: `answer: "Invoice lines round HALF_UP, not HALF_EVEN | why: HALF_UP is the rounding mode chosen for invoice lines" | source: key fact k1 reason "the total must equal the sum of the printed lines that customers add up"`.

### WJ2: every kept item is supported

What it asks: each kept add or update is stated by the transcript, is not contradicted later, and states none of the claims the input does not support.

| Way | How | Items | Rows | Subtlety |
|---|---|---|---|---|
| A. State a listed `not_established` claim | Say the thing is merged, pushed, sent, installed or documented. Example: `-13` links item ends with `, already sent to fenwick-books`. | `-01` (pushed or merged), `-05` (!164 merged), `-12` (`microplot` installed), `-13` (sent to fenwick-books), `-18` (plots endpoints documented) | 5 | obvious |
| B. State a refuted claim | Obvious: the early claim as it was said, in an extra item (`-19`: the disk alert is a false alarm from a miscalibrated sensor; `-20`: the 2.3.2 build is green on all three platforms). Subtle: the same claim in other words, or as its consequence (`-19`: `The gauge-7.test disk alert needs no action`; `-20`: next item `Publish 2.3.2: every release build passed`). | `-19`, `-20` (each twice) | 4 (2 obvious, 2 subtle) | mixed |
| C. Invent a detail the transcript does not hold | One extra item with a plausible number, duration, host or file that appears nowhere in the turns, such as a run time, a second host or a test count. Search the built document to make sure the detail is absent. Do not change a key-fact item. | `-03`, `-11`, `-14`, `-17`, `-21` | 5 | subtle |
| D. A step that is running, asked or planned, written as finished | Obvious, listed claim: `-03` the reload of 2026-11-01 finished; `-05` the CSV export is finished; `-20` 2.3.2 is published. Subtle, not in the list: `-04` stations on firmware older than 3.1 are muted from 03:00 to 03:02 (the turn only asks); `-06` the 2.3.2 artifacts are signed and the version is bumped (the turn only plans it); `-01` the overlap fix runs on staging (the turn says not pushed). Keep the key-fact item that states the true state. | `-03`, `-05`, `-20`, `-04`, `-06`, `-01` | 6 (3 obvious, 3 subtle) | mixed |

Evidence: the quoted span of the answer that carries the false claim, then the claim of `refuted` or `not_established` it matches, or the transcript span it goes beyond, or "absent from the transcript". Example: `answer: "already sent to fenwick-books" | source: not_established "The export was sent to fenwick-books"`.

### WJ3: no kept add rewords another item

What it asks: no kept add says the same thing, in other words, as another kept item or as an open ledger fact shown in the case.

Each pair must have a word overlap under 0.6, or G2 refuses the add. Check with `outcomeOf` (section 5).

| Way | How | Items | Rows | Subtlety |
|---|---|---|---|---|
| A. Add a fact the ledger already holds | Add `naive_add` of an `already_in_ledger` entry with `g2_refuses_naive_add` false, with its `span` as anchor, in the ledger fact's section (a `decisions` fact needs a `why`). On a quiet item, the answer is this one add, WJ1 is `open`, and W4 fails by design. | `-14` (f26), `-15` (f82), `-15` (f54), `-16` (f188, quiet), `-09` (f108, quiet) | 5 | obvious |
| B. Two adds that say the same thing | Obvious: two items in the same section, one the reference text, one the same fact reworded (`-01` k1, `-13` k2, `-20` k2). Subtle: the twin in another section or another sentence form (`-05`: `now` k5 plus `next: Export the 37 changed March invoices to out/march-diff.csv`; `-19`: k2 plus `Log rotation is missing on gauge-7.test, so /var/log/tidewatch grew to 41 GB`; `-11`: decision k1 plus `done: Slot holds lock in Postgres, not in Redis`). | `-01`, `-13`, `-20`, `-05`, `-19`, `-11` | 6 (3 obvious, 3 subtle) | mixed |
| C. A `links` add that restates a `done` add, or the reverse | `links` items are not compared by G2. Obvious: `-01` links `fix/overlap-null holds the overlap fix at 4be19a7, unpushed` beside k2; `-04` done `Window fix is committed as 9d02c7e on fix/sal-calibration-window, not merged` beside k4. Subtle: `-05` done `Line rounding fix is pushed as c41d9e2, with !164 open` beside k4; `-13` done `The 1,204-row March sample export is in out/fenwick-2026-03.csv` beside k3; `-06` done `Branch hotfix/2.3.2 is cut from tag v2.3.1` beside k3. | `-01`, `-04`, `-05`, `-13`, `-06` | 5 (2 obvious, 3 subtle) | mixed |
| D. An add that rewords an update of the same answer | Keep the update of the reference and add its new state again in other words: `-03` now `The 2026-11-01 partition of stg_orders is being reloaded` beside the update of f95; `-06` next `Get a 2.3.2 hotfix of the truncated archive check out today` beside the update of f294; `-21` done `NV-2 is taxed at 9.0 % starting 2026-11-01` beside the update of f40; `-06` now `Preparing the 2.3.2 hotfix for pelican verify` beside the update of f294. All pass the gates (the first three checked). | `-03`, `-06`, `-21`, `-06` | 4 | subtle |

Evidence: the two quoted texts of the pair, and for a ledger pair the fact id. Example: `answer: "Probes wait 15 seconds instead of 5 before they give up, as set in config/probes.toml" | source: open ledger fact f26 "Probe timeout raised from 5 s to 15 s in config/probes.toml"`.

### WJ4: every kept item stands alone and is about the work

What it asks: each kept item is understood without the transcript (no unresolved it, this, that, the issue), and its subject is the work, never the agent or the tool.

Commands and programs that belong to the work (`codesign`, `redocly lint`, `RoundTest`) are fine as subjects. The breach is the coding agent or its harness tools.

| Way | How | Items | Rows | Subtlety |
|---|---|---|---|---|
| A. First person as subject | Obvious: the item opens with `I` or `We` (`-01` `I added a null check in src/booking/overlap.ts; all 42 booking tests pass`; `-03` `I changed the extract window of jobs/extract_orders.py to UTC`; `-12` `We draw the last 24 hours as one SVG polyline in src/lib/Sparkline.svelte`; `-20` `I checked the Linux and Windows release builds for 2.3.2: both green`). Subtle: the work opens the item and `I` is the subject of the second clause (`-15` `fact_orders loads on basalt-2 and I matched the row counts at 2,210,418`). | `-01`, `-03`, `-12`, `-20`, `-15` | 5 (4 obvious, 1 subtle) | mixed |
| B. The agent or its tool as subject | Obvious: `The coding agent restarted tidewatchd on gauge-3.test ...` (`-14`), `Claude Code ran redocly lint ...` (`-18`), `The Edit tool changed src/booking/hold.ts ...` (`-11`), `The Bash tool showed /var on gauge-7.test at 97 % with 1.4 GB free` (`-19`). Subtle: the tool is the subject of a second clause (`-17` `src/lib/Toggle.svelte uses --ink-2 in dark mode, as the Edit tool set it; contrast went from 2.1:1 to 4.8:1`). Never `Claude ...`, `Codex ...` or `The agent ...` followed by a verb: G1 refuses them. | `-14`, `-18`, `-11`, `-19`, `-17` | 5 (4 obvious, 1 subtle) | mixed |
| C. Opener with no antecedent | An extra supported item that opens with `It`, `They`, `That` or `The issue`. Obvious: `-11` `It passes the 6 tests in test/booking/hold.test.ts`; `-18` `They are missing from docs/openapi.yaml too` (the plots endpoints). Subtle: `-17` next `Redo that flow later, not now` (the onboarding flow); `-06` an item about the truncated archive bug that opens with `The issue ...`. | `-11`, `-18`, `-17`, `-06` | 4 (2 obvious, 2 subtle) | mixed |
| D. Unresolved reference inside the item | A definite or demonstrative noun whose referent is only in the transcript: `the change`, `the same merge request`, `that branch`, `those stations`, `the earlier run`. Example: `-04` k3 as `Replay of 02:50 to 03:10 raises no page with the change`. Keep every other noun of the key fact. | `-04`, `-05`, `-06`, `-12`, `-15`, `-21` | 6 | subtle |

Evidence: the quoted item, and what is unresolved or who the subject is. Example: `answer: "The Edit tool changed src/booking/hold.ts" | source: the subject is the agent's tool, not the work`.

### Ids

Number each criterion's rows `jb-WJn-01` to `jb-WJn-20` in the order of the tables above (way A first). Never reuse the same answer text twice.

## 5 Check every answer before you write its row

Entry points, all in `evals/writer/`:

- `loadItems(file)` in `prompt.ts`: the 24 items of `dataset.jsonl`.
- `outcomeOf(item, text)` in `scoring.ts`: runs the plugin parser `parseAnswer(unfenced(text), resolving)`, the gates and the ledger. This is the parser entry point.
- `grade(item, text)` in `scoring.ts`: the code criteria marks.
- `judgeApplies(item, text)` in `scoring.ts`: which judge criteria apply.
- `view(item, text)` in `scoring.ts`: exactly what the judge will read.

Do not import `run.ts`: it starts a run when it loads.

Accept a row only when:

- `outcomeOf(item, text).kind === 'ops'`;
- `outcomeOf(item, text).problems` is empty;
- `outcomeOf(item, text).refused` is empty;
- for a clean answer, every mark of `grade(item, text).marks` is `true` or `null`;
- for a breached answer, the only `false` marks of `grade` are the ones the breach itself causes;
- the `view(item, text).answer` shows the breach as written.

Then read the `view` as the judge would, and check the three other criteria by hand.

## 6 Row shape

One JSON object per line of `dataset-b.jsonl`:

| Field | Content |
|---|---|
| `id` | `jb-WJ1-NN` to `jb-WJ4-NN`, or `jb-writer-clean-NN` |
| `eval` | `"writer"` |
| `source` | the full item id, such as `"writer-11-reason-advisory-lock"` |
| `answer` | the answer text, `JSON.stringify({ ops: [...] })` |
| `breach` | `"WJ1"` to `"WJ4"`, or `null` for a clean answer |
| `expected` | `{"WJ1": …, "WJ2": …, "WJ3": …, "WJ4": …}`: `"fail"` for the breached criterion; `"open"` for each criterion `judgeApplies` gives false (WJ1 on a quiet item, WJ3 when nothing is added); `"pass"` for the rest |
| `evidence` | `"answer: <quoted span> \| source: <fact, claim or span>"`, or `null` for a clean answer |

Each op of `answer` uses the writer's contract. An add: `op`, `section`, `text`, `why`, `ref`, `at` (the time label of the turn, from the key fact's `at`), `agent` (`"a1"`), `anchor`. An update: `op`, `id`, `text`, `why`, `anchor`. A close: `op`, `id`, `why`.

The five rows below were built with these entry points: no parse problem, no refusal. Only `jb-WJ1-01` fails a code criterion (W10, caused by the breach).

WJ1, way B (decision moved to `done`, no reason):

```json
{"id":"jb-WJ1-01","eval":"writer","source":"writer-11-reason-advisory-lock","answer":"{\"ops\":[{\"op\":\"add\",\"section\":\"done\",\"text\":\"Slot holds use a Postgres advisory lock, not a Redis lock\",\"why\":null,\"ref\":null,\"at\":\"09:16\",\"agent\":\"a1\",\"anchor\":\"ok, advisory lock\"},{\"op\":\"add\",\"section\":\"done\",\"text\":\"`src/booking/hold.ts` takes `pg_advisory_xact_lock` on the slot id before inserting the hold\",\"why\":null,\"ref\":null,\"at\":\"09:25\",\"agent\":\"a1\",\"anchor\":\"takes `pg_advisory_xact_lock` on the slot id before it inserts the hold\"}]}","breach":"WJ1","expected":{"WJ1":"fail","WJ2":"pass","WJ3":"pass","WJ4":"pass"},"evidence":"answer: \"Slot holds use a Postgres advisory lock, not a Redis lock | why: -\" (section done) | source: key fact k1 reason \"the booking already runs in one Postgres transaction and staging has no Redis\""}
```

WJ2, way A (listed claim added to the key-fact item):

```json
{"id":"jb-WJ2-01","eval":"writer","source":"writer-13-reason-integer-cents","answer":"{\"ops\":[{\"op\":\"add\",\"section\":\"decisions\",\"text\":\"The fenwick-books export writes amounts as integer cents\",\"why\":\"the fenwick-books import rejects any amount with a decimal point\",\"ref\":null,\"at\":\"11:05\",\"agent\":\"a1\",\"anchor\":\"the fenwick-books import rejects anything with a decimal point\"},{\"op\":\"add\",\"section\":\"done\",\"text\":\"`app/export/FenwickRow.kt` writes every amount as integer cents; `FenwickRowTest` passes 14 cases\",\"why\":null,\"ref\":null,\"at\":\"11:29\",\"agent\":\"a1\",\"anchor\":\"writes every amount as integer cents\"},{\"op\":\"add\",\"section\":\"links\",\"text\":\"`out/fenwick-2026-03.csv` is the March sample export, 1,204 rows, already sent to fenwick-books\",\"why\":null,\"ref\":null,\"at\":\"11:29\",\"agent\":\"a1\",\"anchor\":\"The sample file for March is at `out/fenwick-2026-03.csv`\"},{\"op\":\"close\",\"id\":\"f295\",\"why\":\"answered\"}]}","breach":"WJ2","expected":{"WJ1":"pass","WJ2":"fail","WJ3":"pass","WJ4":"pass"},"evidence":"answer: \"already sent to fenwick-books\" | source: not_established \"The export was sent to fenwick-books\""}
```

WJ3, way A (a fact the ledger already holds, which G2 does not catch):

```json
{"id":"jb-WJ3-01","eval":"writer","source":"writer-14-reworded-probe-timeout","answer":"{\"ops\":[{\"op\":\"add\",\"section\":\"done\",\"text\":\"`tidewatchd` is restarted on gauge-3.test and reports active\",\"why\":null,\"ref\":null,\"at\":\"11:58\",\"agent\":\"a1\",\"anchor\":\"`tidewatchd` is restarted on gauge-3.test and reports active\"},{\"op\":\"add\",\"section\":\"done\",\"text\":\"Probes wait 15 seconds instead of 5 before they give up, as set in config/probes.toml\",\"why\":null,\"ref\":null,\"at\":\"11:58\",\"agent\":\"a1\",\"anchor\":\"probes wait 15 seconds instead of 5 before they give up\"}]}","breach":"WJ3","expected":{"WJ1":"pass","WJ2":"pass","WJ3":"fail","WJ4":"pass"},"evidence":"answer: \"Probes wait 15 seconds instead of 5 before they give up, as set in config/probes.toml\" | source: open ledger fact f26 \"Probe timeout raised from 5 s to 15 s in `config/probes.toml`\""}
```

WJ4, way B (the agent's tool as subject):

```json
{"id":"jb-WJ4-01","eval":"writer","source":"writer-11-reason-advisory-lock","answer":"{\"ops\":[{\"op\":\"add\",\"section\":\"decisions\",\"text\":\"Slot holds use a Postgres advisory lock, not a Redis lock\",\"why\":\"the booking already runs in one Postgres transaction and staging has no Redis\",\"ref\":null,\"at\":\"09:16\",\"agent\":\"a1\",\"anchor\":\"ok, advisory lock\"},{\"op\":\"add\",\"section\":\"done\",\"text\":\"The Edit tool changed `src/booking/hold.ts` to take `pg_advisory_xact_lock` on the slot id before inserting the hold\",\"why\":null,\"ref\":null,\"at\":\"09:25\",\"agent\":\"a1\",\"anchor\":\"takes `pg_advisory_xact_lock` on the slot id before it inserts the hold\"}]}","breach":"WJ4","expected":{"WJ1":"pass","WJ2":"pass","WJ3":"pass","WJ4":"fail"},"evidence":"answer: \"The Edit tool changed `src/booking/hold.ts`\" | source: the subject is the agent's tool, not the work"}
```

Clean (the reference answer of `writer-01`):

```json
{"id":"jb-writer-clean-01","eval":"writer","source":"writer-01-real-booking-tests","answer":"{\"ops\":[{\"op\":\"add\",\"section\":\"done\",\"text\":\"All 42 booking tests pass after a null check in `src/booking/overlap.ts`\",\"why\":null,\"ref\":null,\"at\":\"07:59\",\"agent\":\"a1\",\"anchor\":\"I added the check and all 42 tests pass now\"},{\"op\":\"add\",\"section\":\"done\",\"text\":\"Overlap fix is committed as 4be19a7 on fix/overlap-null, not pushed yet\",\"why\":null,\"ref\":null,\"at\":\"07:59\",\"agent\":\"a1\",\"anchor\":\"The fix is committed as 4be19a7 on fix/overlap-null\"},{\"op\":\"close\",\"id\":\"f14\",\"why\":\"done\"}]}","breach":null,"expected":{"WJ1":"pass","WJ2":"pass","WJ3":"pass","WJ4":"pass"},"evidence":null}
```

## 7 Known risks of these labels

- A decision and a `done` item on the same code (`-05`, `-11`, `-13`) can look like a pair to the judge. They state different facts: the choice with its reason, and the file with its test result. Keep both, and keep them worded apart. If the judge names such a pair often, the pass labels of WJ3 on these items are the first suspects.
- An anchor quotes the turn as written, often in the first person (`I added the check ...`). The anchor is a quote, not the item. WJ4 judges the item text.
- The labels are written by a model and audited by nobody.
