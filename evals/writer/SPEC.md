# Eval spec: recap writer (`evals/writer/`)

The expected answers were written by a model and audited by nobody yet. Every report of this eval must repeat that sentence.

## 1 The job and the unit

The recap writer turns one writer input (the fact ledger of a tab plus the new turns) into `{"ops":[…]}`: add, update and close operations on the ledger. A wrong answer costs the operator an empty recap after real work, a missing decision, an invented fact, a duplicate, or a second goal.

- **Unit:** the first writer answer to one item. The plugin gives a refused answer one correction round; this eval does not run it, so the gate criteria measure the first answer.
- **Lever:** the configuration only (backend, model, effort). The prompt, the input document, the parser and the gates are the plugin's own, imported unchanged.

| Piece | Plugin code used unchanged |
|---|---|
| System prompt | `instructions(request)` in `tab-recap/src/adapters/job/prompts/recap-instructions.ts` |
| User document | `writerContext(request, TRANSCRIPT_BUDGET)` in `tab-recap/src/recap/application/writer-context.ts` |
| Parser | `parseAnswer(text, resolving)` in `tab-recap/src/recap/application/ops-answer.ts`, after `unfenced` from `prompts/recap-prompt.ts` |
| Gates | `LEDGER_GATES` through `judge(gates, ops, ground, now)` in `tab-recap/src/recap/application/ops-gating.ts` (it also applies the kept operations to the ledger and reports ledger refusals as gate `L`) |
| Ledger state after the answer | `apply` in `tab-recap/src/recap/domain/ops.ts` |

`item.input` is a `RecapRequest` (`tab-recap/src/ports/summarizer.ts`): `{ input: RecapInput, language, previousLanguage }`. It goes into both builders as it is.

**The ground the gates need is built from the item alone.** The plugin's `groundOf` reads the live store; here the same fields come from `item.input`, as `groundOf` in `check-dataset.ts` does: one task `t1`; `shown` maps each ledger id (`f1`…) to a `Fact` made from the `InputFact`; `open` and `closedLately` (closed in the last 24 hours) come from the same facts; `source` is `anchorSource(input)`; `agents` are the lower-cased id, label and kind. `check-dataset.ts` runs a reference answer for every item through this path with no refusal, which shows the path works from outside the plugin.

**One difference from the plugin's path, not verified:** for a harness with a prompt limit the plugin calls `fittedCall`, which shrinks the transcript when the document is too large. The SDK transports have no such limit, so the eval sends the full document. The two largest items (116,616 and 127,940 bytes) are the ones this could affect.

## 2 Criteria

A mark is pass, fail, or missing. A transport failure is missing, never a fail. An answer that `parseAnswer` rejects fails every code criterion and gets no judge call. "Kept" means: not refused by a gate or by the ledger. R = regression (the shipped configuration is expected to pass; a fail is a defect). C = capability (a measure of how much is achieved).

### Code criteria

| Id | Checks | Breach | Applies to | Kind |
|---|---|---|---|---|
| W1 | Contract: `parseAnswer` returns kind `ops` | kind `invalid` or `old-shape` | all 24 | R |
| W1s | Shape: `parseAnswer` returns no problem | one or more entries in `problems` | all 24 | R |
| W2.G1, W2.G2, W2.G3, W2.G5, W2.G6, W2.G10, W2.G11, W2.G12, W2.L | Nothing refused, one mark per gate (`L` = refused by the ledger, such as a second goal or an unknown id) | one or more operations refused by that gate | all 24 | R |
| W3 | Not empty on a real turn | no kept add and no kept update | 16 items with `expected.quiet` false | R |
| W4 | Quiet when nothing is new | any add in the parsed answer, kept or refused | 8 items with `expected.quiet` true | R |
| W5 | One goal | after `apply` of the kept operations more than one goal is open, or an add of section `goal` was refused as a second goal, or (on the 2 items with `one_goal.bait_span`) any add of section `goal` | all 24 | R |
| W10 | A decision has its reason | no kept add or update of section `decisions` with a `why` that is not null | 4 items with a key fact of section `decisions` | R |
| W12a | Closes what the turns settle | a fact of `expected.must_close` is not settled. Settled means: a kept close with a reason in its `why` list; or, when `accept_update` is true, a kept update of that id; or, for a fact of section `now`, no operation on it (the ledger closes a `now` fact that is not carried forward) | 8 items with `must_close` | C |
| W12b | Leaves open what is still true | a kept close of an id in `expected.must_stay` | all 24 | R |
| W13a | After a language change, the ledger is carried over at all | no kept update of any id in `expected.must_rewrite.ids` | 3 language items | R |
| W13b | After a language change, every open fact is carried over | one or more ids of `must_rewrite.ids` without a kept update, or an update whose text `languageOfLine` reads as the previous language | 3 language items | C |

The count of facts rewritten out of `must_rewrite.ids` is written to the results as a number beside W13b; it is not a mark.

W2 is the code half of three rubric checks: G2 for "no duplicate" (I6), G11 for "supported" (I4, an anchor copied from the input), G3 for the reason of a decision. The judge decides what code cannot.

### Judge criteria

One call per answer returns the four criteria, each pass or fail with a quoted evidence. The judge is `claude-sonnet-5-5` at medium effort through the Claude Agent SDK. It never sees the configuration, the model, the effort or the repetition. The burden of proof is on passing: when the judge cannot quote the evidence, the mark is fail; a pass whose quote is not in the case or the answer is missing.

**What the judge sees (`view`).** `case`: the transcript part of the built document (everything from `<transcript` on, as the writer saw it, so a clipped turn is clipped for the judge too); the ledger facts the expected answer names (`already_in_ledger`, `must_close`, `must_stay`, `via_update_of`); for each kept add, the 5 open ledger facts with the highest `jaccard` to its text; the list `key_facts` (text, section, span, and the reason for a decision); the lists `refuted` and `not_established` under the title "claims the input does not support". `answer`: the kept operations as the writer gave them, one per line with section, text, why and anchor.

| Id | Exact question | Breach | Applies to | Kind |
|---|---|---|---|---|
| WJ1 | "For each key fact listed: does one kept item state it? A decision counts only if the item also gives its reason. Quote the item for each key fact. Pass only if every key fact is carried." | one or more key facts with no item to quote | answers on the 16 items with key facts | C |
| WJ2 | "For each kept add or update: does the transcript shown state what the item says, and does nothing later in the transcript contradict it? Quote the transcript for each item. An item that states one of the claims the input does not support fails." | one or more items with no quote, or one that states a refuted or not established claim | answers that keep an add or an update | C |
| WJ3 | "Is any kept add a rewording of another kept item, or of an open ledger fact shown? Name the pair, or answer none. Pass only on none." | a named pair | answers that keep an add | R |
| WJ4 | "Is every kept item understood without the transcript (no unresolved it, this, that, the issue) and is its subject the work, never the agent or the tool? Quote any item that fails." | a quoted item | answers that keep an add or an update | C |

WJ2 covers rubric I4 and I7, WJ3 covers I6 beyond gate G2, WJ4 covers I2 and I5. Until `evals/judge-agreement` part B has checked a criterion against planted breaches, the report prints it as "judge, not validated".

**Not scored in this run:** rubric I1 (atomic), I3 (specific; gate G8 only flags) and the per-section rules, beyond `accept_sections` being available to a later criterion. Language quality is measured by the real-data language eval; here only gate G5 and W13.

## 3 Dataset

`dataset.jsonl`, 24 items, all invented: 6 fictional projects (`orchard-api`, `lantern-ui`, `quarry-etl`, `tidewatch`, `pelican-cli`, `mossbank`), hosts under `.test`, no real path, person, host or project. No stored text was read to write it; the real store was read for counts and lengths only.

Built by `build-dataset.ts` from `dataset-scenarios.ts` (the 24 hand-written cases: turns, planted ledger facts, expected answers) and `dataset-vocabulary.ts` (the vocabulary of the filler ledger facts). The build is deterministic: `bun run build-dataset.ts` writes the same file again. `bun run check-dataset.ts` checks it (section 3.3).

### 3.1 Shape, against the real data

Read from the snapshot as counts and lengths (1,129 stored inputs):

| | Real inputs | This dataset |
|---|---|---|
| Agents and ledgers per input | 1 and 1 in nearly all | 1 and 1 in all |
| Turns per input | median 2, 90th percentile 9 | 2 to 6 turns, plus tool calls |
| Document bytes, small third | median 9,913 | 2,366 to 6,917 (10 items) |
| Document bytes, middle third | median 27,544 | 19,555 to 25,297 (9 items) |
| Document bytes, large third | median 143,640, largest 213,749 | 47,787 to 127,940 (5 items) |
| Ledger facts | 29, 100 and 547 at the three medians | 10 to 28, 84 to 112, 210 to 560 |
| Section mix of ledger facts | done 42 %, links 18 %, needs 17 %, next 12 %, decisions 5 %, rules 3 %, now 1 %, goal under 1 % | filler drawn at done 43 %, links 18 %, needs 17 %, next 12 %, decisions 6 %, rules 4 %; goal and now only as planted facts |
| Closed facts in the ledger | about 2 % | about 2.5 % of the filler |
| Agent turns clipped in the middle | common (third quartile of agent turn length is the clip length) | 1 item (`writer-04`) |

The size comes from the ledger, as in the real data: the turns are short and the ledger is long. The small items are smaller than the real small third, and the largest item is 60 % of the largest real input.

### 3.2 Item format

One JSON object per line:

- `id`, `plants` (the planted failure modes), `tags` (`size:…`, `project:…`, and what else the item holds), `meta` (project, size, `ledger_facts`, `open_facts`, `entries`, `document_bytes` of the built document).
- `input`: the `RecapRequest`.
- `expected`:
  - `quiet`: true when the turns establish nothing new, so no add is right.
  - `key_facts`: the facts the turns establish. Each has `k`, `section` and `accept_sections`, a reference `text` (16 words or fewer), `why` (a decision's reason), `span` (120 characters or fewer, copied from a turn: a valid anchor), `why_span`, `entry` (index of the transcript entry), `at` (the turn's time label), `via_update_of` (the ledger id when the fact is the new state of an existing fact).
  - `already_in_ledger`: ledger facts the turns restate in other words: `id`, `span`, `naive_add` (the add a careless writer would make) and `g2_refuses_naive_add` (whether the plugin's G2 gate would refuse that add; false on 7 of 10, which is where only the judge can see the duplicate).
  - `must_close`: `id`, `section`, the accepted close reasons `why`, `accept_update`, and the `span` that settles it.
  - `must_stay`: open ids that are still true, some of them look-alikes of a closed or changed fact.
  - `must_rewrite`: on language items, `to` and the open ids (links excluded) that the instructions say to rewrite.
  - `one_goal`: the open goal id and, on the bait items, `bait_span`.
  - `refuted`: a claim an early turn makes and a later turn withdraws: `claim`, `span`, `by_span`.
  - `not_established`: claims that look supported and are not, each with the reason; `hidden_span` when the sentence sits in the clipped middle of a turn.
  - `optional`: facts a writer may add without being wrong and without being required.
  - `reference_ops`: one acceptable answer, in the writer's own contract. `reference_complete` is false on the language items, where the rewrites are not written out.

### 3.3 Plants

An item can carry more than one plant. Counts are items.

| Plant (inventory 1) | Items | What is planted |
|---|---|---|
| `real`: a real turn must not give an empty recap | 6 (01 to 06) | work done, with results; 2 small and easy, 2 medium, 2 large; one with a clipped turn, one with a change of goal |
| `quiet`: nothing new, so no add | 8 (07 to 10, 16, 22 to 24) | thanks only; a status recap that repeats the ledger; "still green"; "ok" on a 560-fact ledger |
| `reason`: a decision whose reason is in the turns | 4 (05, 11, 12, 13) | the reason sits in an earlier turn than the decision in 11 and 12 |
| `reworded`: a fact already in the ledger in other words | 6 (08, 09, 14, 15, 16, 24) | 10 restated facts; one is a needle in a 420-fact ledger |
| `second-goal`: a second goal mentioned in passing | 2 (17, 18) | an operator aside; an agent aside |
| `goal-change`: the operator replaces the goal | 1 (06) | the old goal must be closed or updated, one goal stays open |
| `contradicted`: stated, then contradicted later | 3 (19, 20, 21) | two retractions inside the turns; one stale ledger fact beside a look-alike that must stay |
| `language`: a turn with nothing new after a language change | 3 (22, 23, 24) | English to Spanish (12 and 90 facts), Spanish to English (10 hand-written facts) |

Also planted across items: 10 stale facts to close (a finished `next`, an answered `needs`, a `now` that moved on), 46 still-true facts that must stay, 27 unsupported claims. Narrator voice is tempted in every item: the agent turns are written in the first person.

Plain easy items, tagged `easy`: 01, 02, 07, 11, 14, 22. A criterion that passes on all of them in every configuration is saturated there and the report says so.

### 3.4 Checks made on the dataset

`bun run check-dataset.ts` passed on this file: 24 items parse; ids are unique; `instructions` and `writerContext` accept every input and the document shows every ledger fact; every span (77) is in the built document and in the plugin's anchor source; every id the expected answer names is an open fact of that ledger; the clipped sentence of `writer-04` is absent from the document; no filler name appears in a turn; no key fact is close to another open ledger fact (`jaccard` under 0.5); the 51 reference operations parse with no problem and pass every gate with no refusal and no flag; each of the 10 naive duplicate adds was run through the gates and `g2_refuses_naive_add` records the result; no item contains a real name pattern or a host outside `.test`.

What the check does not show: that a reference answer is the only right answer, or that a judge would accept it.

## 4 Configurations

From `evals/lib/ladder.ts`, proven in `sdk-facts.md`. The shipped one is marked.

| Name | Backend | Model | Effort | |
|---|---|---|---|---|
| `codex-luna-medium` | codex | `gpt-6-luna` | medium | **shipped** |
| `codex-luna-low` | codex | `gpt-6-luna` | low | |
| `codex-sol-medium` | codex | `gpt-6.1-sol` | medium | |
| `codex-terra-medium` | codex | `gpt-6.1-terra` | medium | |
| `claude-haiku-medium` | claude | `claude-haiku-5-5` | medium | |
| `claude-sonnet-medium` | claude | `claude-sonnet-5-5` | medium | graded by its own model |
| `claude-sonnet-high` | claude | `claude-sonnet-5-5` | high | graded by its own model |

Basis of "shipped": the store shows the writer on `codex/gpt-6-luna`; medium is the plugin's default for `TAB_RECAP_EFFORT`. The owner's live effort setting was not read.

## 5 Runs

- 24 items x 6 configurations x 3 repetitions = 432 writer calls; at most 432 judge calls (none for an unparsed answer).
- An item passes a criterion when all 3 repetitions pass; items that flip are listed.
- Reported per criterion and configuration: k of n with a Wilson 95 % interval; each configuration paired with the shipped one on the same items, exact McNemar.
- Counted per configuration: calls, tokens, seconds, and cost where the SDK reports it.
- Outputs: `$HOME/.local/state/tab-recap-evals/suite/writer/runs/<label>/`, never in the repository.

## 6 What a run can and cannot show

Can show:
- Which configurations break the contract or are refused by a gate on the first answer, and by which gate.
- Whether the empty recap on a real turn (W3) and the no-operation answer after a language change (W13a) reproduce on mocked inputs, and in which configurations.
- Which planted cases each configuration misses: the duplicate the gate cannot see, the second goal, the retracted claim, the stale fact, the reason of a decision.
- A difference of about 25 points or more between two configurations on the criteria that apply to all 24 items.
- Calls, tokens, seconds and cost per configuration.

Cannot show:
- How often any failure happens in real use: the cases are chosen, not sampled.
- A pass against a bar: 24 items give intervals of 30 to 40 points; W10 (4 items), W13 (3 items), W4 (8 items) and W12a (8 items) only list cases.
- That the expected answers are right: a model wrote them and nobody audited them. An item that every configuration fails is first a suspect item.
- That mocked inputs behave like real ones: the filler ledger facts come from templates and are more uniform than real facts, and the small items are smaller than real small inputs.
- An independent grade of the two `claude-sonnet-5-5` configurations: the judge is the same model.
- Anything about the correction round, the enumerator pipeline or the prompt-fitting path.
- A best configuration beyond this set: once a configuration is chosen on these items, they are a development set.

## 7 Open points for the owner

- The dataset path is `evals/writer/dataset.jsonl`; plan v2 names `evals/<name>/dataset/items.jsonl`. One of the two should change.
- The dataset is about 0.9 MB, most of it the filler ledgers of the 5 large items.
- W13b asks for every open fact to be rewritten because the instructions say so; on the 90-fact item this is 86 updates in one answer.

## 8 Fresh set (FRESH-1)

A second set of 24 mocked items, built from `dataset-fresh-scenarios.ts` by `build-dataset.ts --fresh` with the seed `fresh-1/2026-11-14` (`evals/lib/fresh.ts`). It is written to `dataset-fresh.jsonl`, with a sample of six items for the owner in `fresh-sample.md`. The base set and its results are unchanged. Run it with `bun writer/run.ts --fresh --label fresh-<name>`; the label must start with `fresh-`, and `--smoke` is refused.

Each fresh item carries a `fresh` block: the seed and its traps. A trap is one close operation, `why: done`, with an anchor, that the writer should not make. Every trap expects the ledger gates (`LEDGER_GATES`) to keep it (`expect: kept`). The kinds are `close-bait-intent`, `close-bait-partial`, `close-bait-other`, `close-bait-retracted` and `close-bait-hidden`. The close-evidence gate G13 refuses only `close-bait-hidden`, whose anchor is a sentence in a clipped middle of an agent turn that the writer never sees; `g13_refuses` records it per trap.

Counts: 24 items; sizes small 14, medium 8, large 2; plants close-bait-intent 6, close-bait-partial 6, close-bait-other 6, close-bait-retracted 6, close-bait-hidden 6, quotable-close 20, quiet 2. Traps 30: 30 kept by the ledger gates, 0 refused; 6 refused by G13 (the hidden kind).

Owner sample (`fresh-sample.md`): `writer-fresh-05`, `writer-fresh-06`, `writer-fresh-07`, `writer-fresh-14`, `writer-fresh-20`, `writer-fresh-23`.

| item | size | plants | traps | refused by G13 |
| --- | --- | --- | --- | --- |
| writer-fresh-01 | small | close-bait-intent, quotable-close | 1 | 0 |
| writer-fresh-02 | small | close-bait-partial, quotable-close | 1 | 0 |
| writer-fresh-03 | small | close-bait-other, quotable-close | 1 | 0 |
| writer-fresh-04 | medium | close-bait-hidden, quotable-close | 1 | 1 |
| writer-fresh-05 | small | close-bait-retracted, quotable-close | 1 | 0 |
| writer-fresh-06 | small | close-bait-intent, close-bait-partial, quotable-close | 2 | 0 |
| writer-fresh-07 | medium | close-bait-hidden, quotable-close | 1 | 1 |
| writer-fresh-08 | small | close-bait-other, quotable-close | 1 | 0 |
| writer-fresh-09 | small | close-bait-retracted, quotable-close | 1 | 0 |
| writer-fresh-10 | small | close-bait-intent, quiet | 1 | 0 |
| writer-fresh-11 | medium | close-bait-partial, close-bait-hidden, quotable-close | 2 | 1 |
| writer-fresh-12 | medium | close-bait-other, quotable-close | 1 | 0 |
| writer-fresh-13 | small | close-bait-retracted, quotable-close | 1 | 0 |
| writer-fresh-14 | medium | close-bait-hidden, quotable-close | 1 | 1 |
| writer-fresh-15 | medium | close-bait-intent, close-bait-retracted, quotable-close | 2 | 0 |
| writer-fresh-16 | small | close-bait-partial, quotable-close | 1 | 0 |
| writer-fresh-17 | small | close-bait-other, close-bait-retracted | 2 | 0 |
| writer-fresh-18 | large | close-bait-hidden, close-bait-partial, quotable-close | 2 | 1 |
| writer-fresh-19 | small | close-bait-intent, quotable-close | 1 | 0 |
| writer-fresh-20 | small | close-bait-other, quiet | 1 | 0 |
| writer-fresh-21 | medium | close-bait-partial, quotable-close | 1 | 0 |
| writer-fresh-22 | large | close-bait-retracted, close-bait-other, quotable-close | 2 | 0 |
| writer-fresh-23 | small | close-bait-hidden | 1 | 1 |
| writer-fresh-24 | medium | close-bait-intent, quotable-close | 1 | 0 |

The expected answers were written by Opus and reviewed by Sonnet (`fresh-key-review.md`, 24 ok). The owner checks a sample of 6 (`fresh-sample.md`) after the merge; until all six read `owner: ok`, EVAL-8 does not start.
