# Part B recipe: compaction-brief (BJ1 to BJ5)

This recipe tells the writer how to write the planted answers of Part B for the eval `compaction-brief`. It follows `SPEC.md` section 7 (the rows) and section 3 (the gating rule). All data is mocked.

Counts: 20 breached answers per criterion (100 in all) and 5 clean answers. Total 105 rows.

The gate needs the judge to catch at least 19 of the 20 breaches of a criterion, and to pass the breached answers of the other four criteria. So every breached answer must break its own criterion without doubt, and must be a clean pass on the other four.

## 1 What the judge sees

The judge prompt is built by `evals/lib/judge.ts`. The criteria come from `evals/compaction-brief/judge-criteria.ts`. The view comes from `view(item, raw)` in `evals/compaction-brief/scoring.ts`.

- `case`: the document inside `<document>`, then an `<expected>` block with `goal`, `must_keep`, `reasons` (each as `text | reason: why`), `waiting_on_operator`, `settled` and `must_not_reopen`.
- `answer`: the brief after `unfenced`.

Print the view of an item to read its lists before you write (section 9 has the script). The judge passes a criterion only when it can quote words that show it is met. So a clean answer says things plainly, in words the judge can quote.

Note: the goal is always also the first fact of `must_keep`, and each fact of `waiting_on_operator` and `reasons` is also a fact of `must_keep`. This is why some breaches touch two criteria. The ways below avoid that.

## 2 Items to use

Use only these 16 items: cb-01, cb-02, cb-03, cb-04, cb-09, cb-10, cb-11, cb-12, cb-13, cb-14, cb-15, cb-16, cb-17, cb-18, cb-19, cb-20.

Do not use:

- cb-05 to cb-08 (long ledgers). The kept facts and reasons alone take 2,634 to 2,839 of the 3,000 characters. A full brief does not fit, so BJ1 cannot be a clean pass.
- cb-21. The operator's note holds `tab`, which the gate refuses.
- cb-22 to cb-24. The session is in Spanish or Portuguese. The brief must be English, so every fact is a translation, and the judge may read a translation as a change (BJ1, BJ3).

Useful groups:

| Group | Items |
|---|---|
| has a waiting question | cb-01, 02, 03, 04, 10, 11, 13, 14, 15, 16, 17, 18, 19 |
| no waiting question | cb-09, cb-12, cb-20 |
| has settled facts | cb-03, 10, 13, 14, 15, 16, 17 |
| has `must_not_reopen` | cb-14 (1), cb-15 (2), cb-16 (1), cb-17 (1) |
| planted old decision (easy to drop) | cb-09, 10, 11, 12, 13 |
| operator's note | cb-04, cb-15 (start the brief with the note, in your own words) |
| bait (a file named without a path) | cb-12: never write a path the document does not hold |
| gate words in the input | cb-18, cb-19, cb-20: never write the words of section 3 |

Facts with numbers or paths, outside the goal, the decisions and the waiting questions, for BJ1 ways 3 and 4:

| Item | Fact with a number | Fact with a path |
|---|---|---|
| cb-01 | (none; the decisions hold 200 and 6) | internal/deploy/preview_test.go fails ..., docs/cli.md |
| cb-02 | search/eval/queries.tsv has 12 of 60 queries still failing ... | search/eval/queries.tsv |
| cb-03 | scripts/backfill-key-hash.ts times out on the 4.1 million row orders table | test/submit/replay.test.ts ..., src/orders |
| cb-10 | tests/numbering/test_concurrent.py fails 1 run in 20 ... | billing/numbering/counter.py ... |
| cb-11 | tests/visual/select.spec.ts fails at 375 px ... by 12 px | ci/contrast.mjs, packages/tokens/build.mjs |
| cb-14 | build/index.mjs emits 1.3 MB gzipped ... | build/index.mjs |
| cb-15 | Keep each merge request under 400 changed lines | src/orders/submit.ts, src/payments/webhook.ts |
| cb-16 | benches/chunking.rs has no run on the 2-core box ... | crates/daemon/src/error.rs, tests/resume.rs |
| cb-17 | (decisions hold 6 and 7 days) | internal/deploy/preview_test.go ... |
| cb-18 | ... reported 17 tenants with existing gaps | billing/export/ledger.py, tests/fixtures/tax |
| cb-19 | Keep bundle growth under 2 kB per component | ci/contrast.mjs, tests/visual/select.spec.ts |

## 3 How to write a clean answer

A clean answer passes BJ1 to BJ5 and B1 to B7. Every breached answer starts as a clean answer, then changes one thing.

Voice: the operator speaks to the agent, in the first person, in English. Plain sentences in one or a few paragraphs.

Content, in this order:

1. The operator's note first, in your own words, when the item has one (cb-04, cb-15).
2. The goal, marked as the goal: "The goal is to <goal text>. Keep that goal first."
3. Every decision of `reasons`, with its reason after "because": "<decision>, because <why>." Copy the reason with all its details (numbers, names).
4. Every other fact of `must_keep`, close to its words, with every name, path and number kept. Group them as "Open problems:" and "Standing rules:".
5. Every waiting question, marked as waiting for the operator: "Still waiting on me: <question>. I have not answered yet, so leave it open and keep working on the rest." When the item has none, write "Nothing is waiting on me right now."
6. Settled facts: name each fact of `must_not_reopen` as closed: "Already settled and closed, do not reopen: ...". You may name the other settled facts the same way, or leave them out. Never list a settled fact as work.
7. Close with "Drop raw command output and the details of finished steps."

Code-graded rules (check them with the script of section 9):

- B1, B2: never write `recap`, `plugin`, `herdr`, `tab`, `tab-recap`, `recap column`. On cb-19 the session uses `tabs` and `plugin`; still avoid them unless you copy a fact word for word.
- B3: never write `tool`, `tools`, `compaction_input`, `session_history`, `current_recap`.
- B4: at most 3,000 characters after spaces are squashed. Most clean answers are 800 to 1,500.
- B5: no heading (`#`), no list marker at the start of a line (`-`, `*`, `+`, `1.`), no code fence, no backticks needed. Write lists inside a sentence, separated by commas or semicolons.
- B6: English.
- B7: write only paths, file names, URLs, `!n` references and commits that the document holds (`expected.allowed_tokens`). A shortened path of a document path is fine.

Do not add anything the document does not hold. Do not add a reason, a number or a step from memory.

Pick the 5 clean answers from: cb-01, cb-04 (note), cb-10, cb-14, cb-15 (note, two `must_not_reopen`). Ids `jb-compaction-brief-clean-01` to `-05`.

## 4 BJ1: every fact of must_keep is carried, with its detail

What it asks: does the brief carry every fact of `must_keep`, with the names, paths and numbers needed to act on it?

Rules for every BJ1 breach: break one fact only. Never break the goal (that is BJ5) or a waiting question (that is BJ5). Never change a fact into another one: make it vaguer or remove it (another number or path is BJ3). Keep everything else as in the clean answer.

| Way | How | Items | Subtle? |
|---|---|---|---|
| 1 Drop a fact | Remove one standing rule or open problem fully. | cb-02, cb-04, cb-11, cb-18, cb-20 | obvious |
| 2 Drop a decision | Remove one decision of `reasons` together with its reason. BJ2 still passes: a decision the brief does not hold is not a BJ2 breach. On the planted items drop the planted old decision. | cb-09, cb-10, cb-12, cb-13 (planted), cb-19 | obvious |
| 3 Strip the path | Keep the fact, but drop its path or file name, so it cannot be acted on: "a hash test fails between Linux and macOS" for "internal/deploy/preview_test.go fails: ...". | cb-01, cb-03, cb-14, cb-15, cb-16 | subtle |
| 4 Strip the number | Keep the fact, but drop its number: "some queries still fail the top-three check" for "12 of 60 ...". Do not write another number. On cb-17 strip the 6 of the hash decision and keep its reason. | cb-02, cb-10, cb-17, cb-18, cb-19 | subtle |

For ways 3 and 4, the stripped detail must not appear anywhere else in the brief, or the fact is still carried.

Evidence: `answer: (absent) | source: must_keep "<fact as the case writes it>"` for ways 1 and 2. For ways 3 and 4: `answer: "<the vague span>" | source: must_keep "<fact>"; lost: <path or number>`.

## 5 BJ2: every decision held is given its listed reason

What it asks: for every decision of `reasons` that the brief holds, does the brief give the reason listed for it?

Rules for every BJ2 breach: keep the decision itself in the brief, word for word, so BJ1 passes. Change only the reason of one decision (two for way 2). Never write a reason with a number, path or rule that the document lacks, so BJ3 stays clean.

| Way | How | Items | Subtle? |
|---|---|---|---|
| 1 No reason | State the decision and give no reason at all. On the planted items use the planted old decision. | cb-09, cb-10, cb-11, cb-12, cb-13 | obvious |
| 2 Swap reasons | Give two decisions of the same item each other's reasons. Both reasons come from the document. | cb-01, cb-02, cb-04, cb-15, cb-17 | obvious |
| 3 Generic reason | Replace the listed reason by a vague one that shares nothing with it: "because it is simpler", "because the team prefers it", "to keep the code clean". Not a near match ("to save space" for a storage quota reason is too close: do not use it). | cb-03, cb-14, cb-16, cb-18, cb-20 | subtle |
| 4 Circular reason | Give a "reason" that only restates the decision or its effect: "The command exits 0 only after the URL answers 200, because it must wait until the URL answers." | cb-03, cb-04, cb-10, cb-13, cb-19 | subtle |

Evidence: `answer: "<decision span as written, with its wrong or missing reason>" | source: reasons "<decision> | reason: <why>"`.

## 6 BJ3: everything in the brief comes from the document

What it asks: does every decision, rule, path, number and open question of the brief come from the document?

Rules for every BJ3 breach: add one thing; never change a fact of `must_keep`, `reasons`, `waiting_on_operator` or `settled` (that would break BJ1, BJ2, BJ4 or BJ5 too). Keep all of the clean answer. Search the document to make sure the added thing is not there. Never write a path the document lacks (B7 would fail, and on cb-12 it is the bait).

| Way | How | Items | Subtle? |
|---|---|---|---|
| 1 Invented rule | Add a standing rule the document does not hold: "never deploy a preview on a Friday". | cb-01, cb-04, cb-11, cb-18, cb-20 | obvious |
| 2 Invented open question | Add an open question the document does not hold, as a point to keep in mind, not as waiting on the operator: "Still open: whether previews should also be built for tags." | cb-02, cb-09, cb-12, cb-16, cb-19 | obvious |
| 3 Changed number | Restate a number the document shows outside the expected lists (a test count, a run result, a size in a recent turn) with another value: "the last npm run search:eval run showed 2 failures" when the document says 0. | cb-03, cb-10, cb-13, cb-14, cb-15 | subtle |
| 4 Wrong real path | Restate a step or finding of the document outside the expected lists, but put it on another path the document also holds: "moving the URL print after the readiness check in internal/deploy/upload.go" when the document says cmd/kestrel/deploy.go. B7 passes because the path is real. | cb-01, cb-03, cb-17, cb-18, cb-19 | subtle |

For ways 3 and 4, the restated statement must not be a fact of the expected lists. Read the document turns and pick a line from them.

Evidence: `answer: "<added span>" | source: the document holds no such <rule / question>` for ways 1 and 2. For ways 3 and 4: `answer: "<span>" | source: document says "<the true span>"`.

## 7 BJ4: settled facts stay closed

What it asks: does the brief leave every fact of `settled` closed, neither asked as open work nor asked again as a question?

Only the 7 items with settled facts suit: cb-03, cb-10, cb-13, cb-14, cb-15, cb-16, cb-17.

Rules for every BJ4 breach: reopen one settled fact, with its words kept (no changed path or number, so BJ3 stays clean). Remove it from any "settled" sentence, so the brief does not say both. Keep all of `must_keep`, the goal and the waiting questions as in the clean answer. Do not make the reopened fact a waiting question of the operator if that fact is not a question.

| Way | How | Items | Subtle? |
|---|---|---|---|
| 1 Listed as work | Put a fact of `must_not_reopen` among the next steps: "Next step: fix the crash in build/pages.mjs on pages without front matter." | cb-14, cb-15 (first fact), cb-15 (second fact), cb-16, cb-17 | obvious |
| 2 Asked again | Ask a settled fact again as a pending question: "Please confirm a version filter for the index builder before you go on." Settled operator questions suit best. | cb-03, cb-10, cb-13, cb-14, cb-15 | obvious |
| 3 To verify | Present a settled fact as still to check: "Still to check: whether the path separator bug in internal/deploy/ready.go is really fixed." | cb-03, cb-10, cb-13, cb-16, cb-17 | subtle |
| 4 Settled action as a standing order | Take a settled fact worded as an action ("Run ...", "Fix ...", "Editing ...") and write it as a current instruction, among the real rules: "Standing rules: do not edit generated files under public/, and run npm run search:eval before the next commit." | cb-03, cb-13, cb-14, cb-15, cb-16 | subtle |

Evidence: `answer: "<span that reopens it>" | source: settled "<fact>"`.

## 8 BJ5: the agent can tell the goal and the waiting questions

What it asks: reading only the brief, can the agent tell the goal, and see every question of `waiting_on_operator` as waiting for the operator?

Do not remove the goal: the goal is also a fact of `must_keep`, so that would break BJ1. Use these ways instead.

| Way | How | Items | Subtle? |
|---|---|---|---|
| 1 Wrong goal | Name another open fact as "the main goal". Keep the goal text word for word, as an ordinary item ("Also keep in mind: add a ..."). | cb-01, cb-04, cb-10, cb-17, cb-19 | subtle |
| 2 Question handed to the agent | Keep the waiting question with all its words, but put it among the agent's own next steps, with nothing that says it waits for the operator: "Next steps: fix the hash test, then settle whether --preview asks for confirmation on the main branch." | cb-02, cb-03, cb-11, cb-13, cb-18 | subtle |
| 3 Told as answered | Keep the question's words but say it is answered, without giving an answer: "Whether --preview asks for confirmation on the main branch is already answered, so do not raise it again." Do not invent the answer (that is BJ3). | cb-01, cb-04, cb-14, cb-15, cb-16 | obvious |
| 4 Dangling references | Keep the clean answer, and add two or three pointers to things the brief never names: "Start where we left off in that file", "Do the second one the same way as the first", "Keep the fix from this morning." Pointers only: no new rule, number or question (BJ3). | cb-09, cb-11, cb-12, cb-18, cb-20 | obvious |

Ways 2 and 3 need a waiting question. Ways 1 and 4 suit any item.

Evidence: `answer: "<span>" | source: goal "<goal>"` (way 1), `source: waiting_on_operator "<question>"` (ways 2 and 3), or `answer: "<pointer>" | source: the brief names no such thing` (way 4).

## 9 Rows and checks

One JSON object per line in `evals/judge-agreement/dataset-b.jsonl`, with exactly these fields (SPEC section 7):

| Field | Value |
|---|---|
| `id` | `jb-BJ1-01` to `jb-BJ5-20`; clean: `jb-compaction-brief-clean-01` to `-05` |
| `eval` | `"compaction-brief"` |
| `source` | the item id, such as `"cb-01"` |
| `answer` | the brief, as plain text |
| `breach` | `"BJ1"` to `"BJ5"`, or `null` for a clean answer |
| `expected` | `{"BJ1": ..., "BJ2": ..., "BJ3": ..., "BJ4": ..., "BJ5": ...}`: `"fail"` for the breached criterion, `"pass"` for the other four; all `"pass"` for a clean answer. Use `"open"` only when you cannot rewrite the answer so a criterion is clearly met; prefer rewriting |
| `evidence` | as in each section above; `""` for a clean answer |

Number the rows of a criterion in the order of the tables: way 1 is 01 to 05, way 2 is 06 to 10, way 3 is 11 to 15, way 4 is 16 to 20.

Worked examples. All six pass B1 to B7 (checked with the script below).

```json
{"id": "jb-compaction-brief-clean-01", "eval": "compaction-brief", "source": "cb-01", "answer": "The goal is to add a kestrel deploy --preview command that uploads a build to a preview URL and prints it. Keep that goal first in the summary. Decisions we made, with their reasons: the command exits 0 only after the URL answers 200, because CI steps posted dead links when the upload finished before the CDN was ready. Preview URLs are derived from the branch name plus a 6 character hash, because two branches named fix would otherwise collide. Open problem: internal/deploy/preview_test.go fails because the hash differs between Linux and macOS. Standing rules: every flag needs an entry in docs/cli.md, and no new dependency without asking. Still waiting on me: I must choose whether --preview asks for confirmation on the main branch. I have not answered yet, so leave it open and keep working on the rest. Drop raw command output and the details of finished steps.", "breach": null, "expected": {"BJ1": "pass", "BJ2": "pass", "BJ3": "pass", "BJ4": "pass", "BJ5": "pass"}, "evidence": ""}
{"id": "jb-BJ1-01", "eval": "compaction-brief", "source": "cb-01", "answer": "The goal is to add a kestrel deploy --preview command that uploads a build to a preview URL and prints it. Keep that goal first in the summary. Decisions we made, with their reasons: the command exits 0 only after the URL answers 200, because CI steps posted dead links when the upload finished before the CDN was ready. Preview URLs are derived from the branch name plus a 6 character hash, because two branches named fix would otherwise collide. Open problem: internal/deploy/preview_test.go fails because the hash differs between Linux and macOS. Standing rule: every flag needs an entry in docs/cli.md. Still waiting on me: I must choose whether --preview asks for confirmation on the main branch. I have not answered yet, so leave it open and keep working on the rest. Drop raw command output and the details of finished steps.", "breach": "BJ1", "expected": {"BJ1": "fail", "BJ2": "pass", "BJ3": "pass", "BJ4": "pass", "BJ5": "pass"}, "evidence": "answer: (absent) | source: must_keep \"No new dependency without asking\""}
{"id": "jb-BJ2-01", "eval": "compaction-brief", "source": "cb-09", "answer": "The goal is to add a kestrel deploy --preview command that uploads a build to a preview URL and prints it. Keep that goal first. Decisions we made, with their reasons: previews expire after 7 days, because the storage quota is 50 GB and one build is about 180 MB. The command exits 0 only after the URL answers 200, because CI steps posted dead links when the upload finished before the CDN was ready. Uploads use 6 parallel workers, because 8 workers hit the API limit of 100 requests per second. Preview builds are served from the preview.kestrel.test zone, not from a path under the main site. Open problems: internal/deploy/preview_test.go fails because the hash differs between Linux and macOS, and cmd/kestrel/deploy.go prints the URL before the readiness check. Standing rule: no new dependency without asking. Nothing is waiting on me right now. Drop raw command output and the details of finished steps.", "breach": "BJ2", "expected": {"BJ1": "pass", "BJ2": "fail", "BJ3": "pass", "BJ4": "pass", "BJ5": "pass"}, "evidence": "answer: \"Preview builds are served from the preview.kestrel.test zone, not from a path under the main site.\" with no reason | source: reasons \"... | reason: cookies of the main site would otherwise be sent to every preview build\""}
{"id": "jb-BJ3-01", "eval": "compaction-brief", "source": "cb-01", "answer": "The goal is to add a kestrel deploy --preview command that uploads a build to a preview URL and prints it. Keep that goal first in the summary. Decisions we made, with their reasons: the command exits 0 only after the URL answers 200, because CI steps posted dead links when the upload finished before the CDN was ready. Preview URLs are derived from the branch name plus a 6 character hash, because two branches named fix would otherwise collide. Open problem: internal/deploy/preview_test.go fails because the hash differs between Linux and macOS. Standing rules: every flag needs an entry in docs/cli.md, no new dependency without asking, and never deploy a preview on a Friday. Still waiting on me: I must choose whether --preview asks for confirmation on the main branch. I have not answered yet, so leave it open and keep working on the rest. Drop raw command output and the details of finished steps.", "breach": "BJ3", "expected": {"BJ1": "pass", "BJ2": "pass", "BJ3": "fail", "BJ4": "pass", "BJ5": "pass"}, "evidence": "answer: \"never deploy a preview on a Friday\" | source: the document holds no such rule"}
{"id": "jb-BJ4-01", "eval": "compaction-brief", "source": "cb-14", "answer": "The goal is to rebuild the marlin-docs search so a query returns the right page in the first three results. Keep that goal first. Decisions we made, with their reasons: version 1 pages are excluded from the index, because readers landed on the deprecated install guide. The index is built at publish time and shipped as one JSON file, because the hosting is static and cannot run a search server. Next step: fix the crash in build/pages.mjs on pages without front matter. Open problem: build/index.mjs emits 1.3 MB gzipped after code blocks were added. Standing rule: do not edit generated files under public/. Still waiting on me: I am to supply the list of synonyms for product names. Do not invent them, and keep working on the rest. Already settled and closed, do not reopen: the missing title in build/tokenize.mjs, the question of a version filter for the index builder, running npm run search:eval before the next commit, running npm run build after editing search/eval/run.mjs, and the 150 ms debounce in build/index.mjs. Drop raw command output and the details of finished steps.", "breach": "BJ4", "expected": {"BJ1": "pass", "BJ2": "pass", "BJ3": "pass", "BJ4": "fail", "BJ5": "pass"}, "evidence": "answer: \"Next step: fix the crash in build/pages.mjs on pages without front matter.\" | source: settled \"build/pages.mjs crashes on pages without front matter\""}
{"id": "jb-BJ5-01", "eval": "compaction-brief", "source": "cb-17", "answer": "The main goal is to make internal/deploy/preview_test.go pass. Also keep in mind: add a kestrel deploy --preview command that uploads a build to a preview URL and prints it. Decisions we made, with their reasons: preview URLs are derived from the branch name plus a 6 character hash, because two branches named fix would otherwise collide. Previews expire after 7 days, because the storage quota is 50 GB and one build is about 180 MB. Config is read from kestrel.yaml in the repository root only, because searching parent directories picked up a stale file in the monorepo. That test fails because the hash differs between Linux and macOS. Standing rules: errors go to stderr, results to stdout, and no new dependency without asking. Still waiting on me: I must choose whether --preview asks for confirmation on the main branch. Leave it open and keep working on the rest. Already settled and closed: the confirmation prompt before overwriting an existing preview, the path separator fix in internal/deploy/ready.go, and the go vet ./... run after that edit. Drop raw command output and the details of finished steps.", "breach": "BJ5", "expected": {"BJ1": "pass", "BJ2": "pass", "BJ3": "pass", "BJ4": "pass", "BJ5": "fail"}, "evidence": "answer: \"The main goal is to make internal/deploy/preview_test.go pass.\" | source: goal \"Add a kestrel deploy --preview command that uploads a build to a preview URL and prints it\""}
```

Parser entry point: `grade(item, raw)` in `evals/compaction-brief/scoring.ts`, with `item` from `loadItems(path)` in `evals/compaction-brief/prompt.ts`. An answer is judged only when `grade(...).parsed` is `true` (the plugin's gate `vetted(unfenced(text), own)` accepts it). Every row must also have all of B1 to B7 `true`. `view(item, raw)` in the same file gives the exact `case` and `answer` the judge reads. Do not import `evals/compaction-brief/run.ts`: it starts a run when imported.

Check script. Save it outside the worktree (the scratchpad), set `E` to the absolute path of `evals/`, and run `bun check-b.ts <rows.jsonl>`:

```ts
const E = '<absolute path of evals>';
const { loadItems } = await import(`${E}/compaction-brief/prompt.ts`);
const { grade, inspect } = await import(`${E}/compaction-brief/scoring.ts`);
const { unknownTokens } = await import(`${E}/compaction-brief/checks.ts`);
const items = loadItems(`${E}/compaction-brief/dataset.jsonl`);
const rows = (await Bun.file(process.argv[2]).text()).split('\n').filter(Boolean).map((line) => JSON.parse(line));
for (const row of rows.filter((each) => each.eval === 'compaction-brief')) {
    const item = items.find((each) => each.id === row.source);
    const graded = grade(item, row.answer);
    const found = inspect(item, row.answer);
    const bad = Object.entries(graded.marks).filter(([, mark]) => mark !== true).map(([id]) => id);
    console.log(row.id, graded.parsed && bad.length === 0 ? 'ok' : 'BAD', bad.join(','), found.characters, found.refused.join(','), unknownTokens(found.brief, item.expected.allowed_tokens).join(','));
}
```

To read an item's lists, print `view(item, '').case` from the same imports, from `<expected>` to the end.

## 10 Before you hand in

- 20 rows per criterion: 10 obvious (ways marked obvious) and 10 subtle. Subtle still means a careful reader calls it a breach without doubt.
- Each breached row changes one thing from a clean answer of the same item. Re-read it against the other four criteria. If one of them is in doubt, rewrite.
- Every row prints `ok` in the check script.
- No row uses cb-05 to cb-08, cb-21 or cb-22 to cb-24.
