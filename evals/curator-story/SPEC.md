# Eval spec: curator-story (curator, story mode, inventory 3)

The expected answers were written by a model and audited by nobody yet. Every report of this eval must say so.

Paths starting with `tab-recap/` are the plugin; nothing there is changed. Everything else is in `evals/curator-story/`.

## 1 The job under test

When the expanded view opens on a changed task, the plugin sends every fact of that task, open and closed, to the curator. The curator answers one JSON object: `ops` (closes of duplicate open facts, each `{"op":"close","id","why":"merged","into"}`) and `story` (one paragraph of at most 120 words in the task's language).

The eval builds the same call from the plugin's own code. Only the transport changes (Codex SDK, Claude Agent SDK).

| Step | Plugin code, imported unchanged |
|---|---|
| Document (user message) | `curatorInput({ ...item.input, rubric: RUBRIC.items }).document` (`tab-recap/src/recap/application/curator-input.ts`, `tab-recap/src/adapters/job/prompts/rubric.ts`) |
| Instructions (system message) | `CURATOR_INSTRUCTIONS` (`tab-recap/src/adapters/job/prompts/curator-instructions.ts`) |
| Fence removal | `unfenced(text)` (`tab-recap/src/adapters/job/prompts/recap-prompt.ts`), as `HarnessCurator.write` does |
| Parser and gate | `curationOf(unfenced(text), openIds)` (`tab-recap/src/recap/domain/curation.ts`); `openIds` are the ids of `curatorInput(...).facts` whose state is `open`, as `Curate.store` computes them |

`item.input` is `CuratorMaterial` without `rubric`. The rubric is added at run time from `RUBRIC.items`, the value the daemon passes (`tab-recap/src/daemon/curate.ts`), so a rubric change reaches the eval without a dataset rebuild. `check-dataset.ts` proves that the builder accepts every item this way.

Cost of an error in production: a story that says what no fact says, or tells a closed fact as current; a wrong merge closes a fact that held its own detail; a missed merge leaves a duplicate in the recap.

## 2 Dataset (`dataset.jsonl`, 24 items)

Fully mocked. Six invented projects (`orchard`, `lantern`, `quarry`, `tidewater`, `bramble`, `kestrel`), hosts under `.test`, no real path, person, host or project. Written by `build-dataset.ts` (deterministic; run it again to get the same bytes) and checked by `check-dataset.ts`.

One JSON line per item:

| Field | Content |
|---|---|
| `id` | `cs-NN-<plants>-<size>` |
| `plants` | the planted cases (the `Item.plants` of `evals/lib/types.ts`) |
| `tags` | size, project, language, then the plants |
| `shape` | fact counts and the document size without the rubric |
| `input` | `{ name, language, facts: Fact[], clock: { now, zone } }`; `facts` in the order of `ledger.allOf` (`firstAt`, then `id`) |
| `expected` | see below |

Fact ids in `expected` are the document ids the model sees (`f1` is the first fact of `input.facts`), because the answer uses them.

`expected`:

| Field | Meaning |
|---|---|
| `merge_pairs` | `[{ ids: [a, b], kind: 'verbatim' or 'reworded', keep }]`. Two open facts that say the same thing. `keep` is null for a verbatim copy (either direction is right) and the more specific fact for a reworded pair. |
| `no_merge` | `[[a, b]]`. Two open facts that look alike and differ in one material detail (another component, environment or number). Merging them loses a fact. |
| `waiting_on_operator` | `{ ids, gist }` or null. `ids` are all open `needs` facts of the item; `gist` is what the story has to say. Null when no `needs` fact is open. |
| `closed_ids` | `[{ id, closed_why, must_not_say, current }]`. A fact closed as `superseded`, `wrong` or `answered` whose text is tempting to tell as current, the statement the story must not make, and the open fact that replaced it. |
| `names_and_numbers` | every checked token (section 3, S11) of the task name and of the text, reason and reference of every fact |
| `times` | every time string the document shows, plus the date of `clock.now` |

### Plants

| Plant | Items | How it is built |
|---|---|---|
| `plain` | 4 (cs-01 to cs-04) | no duplicate, no near pair, no tempting closed fact, no open `needs`: the easy items, so a saturated criterion shows |
| `verbatim-copy` | 6 (cs-05 to cs-10; 7 pairs, cs-08 has 2) | an open fact copied by code under a new id at a later time, same section, text, reason and reference |
| `reworded-duplicate` | 4 (cs-11 to cs-14) | a vague fact and a later, more specific fact that states the same thing and more; hand-written |
| `near-pair` | 5 (cs-14 to cs-18; 8 pairs) | hand-written look-alikes that must both stay open |
| `closed-tempting` | 7 (cs-09, cs-18 to cs-23; 12 closed facts, plus one each in cs-07 and cs-13) | a superseded decision or goal, a claim closed as wrong, an operator question closed as answered, each with its open replacement |
| `waiting-on-operator` | 5 (cs-07, cs-12, cs-21, cs-23, cs-24) | one open `needs` fact (two in cs-12, which are also its reworded pair) |
| `language-es` | 3 (cs-04, cs-10, cs-22) | `<task language="es">`. cs-04 has Spanish facts; cs-10 and cs-22 have English facts, the state after a language change |

### Sizes and what the real data gave (shape only)

Read as counts and lengths from the read-only snapshot of 2026-11-13; no stored text was copied.

| | Real store | This dataset |
|---|---|---|
| Tasks by fact count | under 10: 95; 10 to 39: 29; 40 to 99: 6; 100 or more: 10 | small (5 to 7 facts): 9; medium (14 to 28): 10; large (48, 64, 80, 96, 112): 5 |
| Closed share of facts | 9 % under 10 facts, 20 % for 10 to 39, 26 to 30 % above | 5 % small, 13 % medium, 23 % large |
| Sections | `done` and `links` dominate open facts; closed facts are mostly `now` superseded, `needs` answered, `next` done | the filler of medium and large items is `done`, `links`, and closed `now` and `next` facts |
| Text length | mean 75 characters for `done`, 29 for `links`, 89 for `needs` | mean 54 for `done`, 18 for `links`, 80 for `needs` |
| Decisions | always carry a reason | always carry a reason (checked) |
| Language of facts | 5376 `en`, 2 `es` | 654 `en`, 5 `es` |
| Fact id | a `fact_` type id | `fact_` plus 26 characters, invented |

Known differences from real data, to read results with:
- The largest real tasks hold several hundred to over a thousand facts. The largest item here has 112 (a 27.7 kB prompt). Nothing here tests the harness limit above which production writes no story (`tab-recap/src/adapters/job/curator.ts`).
- The filler facts of medium and large items come from 8 `done` templates and 5 closed templates over 20 component names per project. They are distinct facts, but they are more regular and shorter than real ones, and they are not about the item's goal.
- `anchor` is null on every fact. The document does not show it.
- Every item uses the clock 2026-11-10 16:30 UTC and the zone `UTC`.

## 3 Criteria

All are graded on the raw answer after `unfenced`. `story` below is the raw `story` string of the answer, not the clipped one `storyOf` returns, so an overlong story is seen. A transport failure is `missing`, never a fail. When S1 fails, every other criterion of that answer is failed by `unparsed(codeCriteria)` and no judge call is made.

### Code

| Id | Criterion | Applies to | Breach | Kind |
|---|---|---|---|---|
| S1 | The answer parses | all | `curationOf` refuses with "the answer is not JSON" or "the answer is not an object" | regression |
| S2 | A story is present | all | `story` is missing, not a string, or has no word | regression |
| S3 | At most 120 words | all | `story.split(/\s+/u)` without empty strings has more than `STORY_WORDS` entries (the plugin would cut it mid-sentence) | regression |
| S4 | Plain prose | all | the story holds a line break, or a part that starts with `- `, `* `, `#`, or a digit followed by `. ` at the start of the story or after a line break | regression |
| S5 | Task language | all | split the story into sentences (`.`, `!`, `?` followed by a space); with `languageOfLine` count the sentences it calls `en` and the ones it calls `es`; breach when the task language does not have the larger count. Mark is empty when no sentence gets a verdict | regression |
| S6 | Only valid operations | all | `curationOf(...).refused` is not empty (an add or update, a close with another reason, a closed or unknown id, a chain of merges) | regression |
| S7 | Planted duplicates merged | items with `merge_pairs` (10) | for some pair neither `{id: a, into: b}` nor `{id: b, into: a}` is among the accepted merges | capability |
| S8 | The more specific fact is kept | answers that merged a reworded pair | the accepted merge closes `keep` | capability |
| S9 | No near pair merged | items with `no_merge` (5) | an accepted merge joins the two facts of a `no_merge` pair, in either direction | capability |
| S10 | No merge outside the planted pairs | all | an accepted merge joins two facts that are not a `merge_pairs` pair | capability |
| S11 | No name or number from outside the ledger | all | `outsideOf({ names: expected.names_and_numbers, times: expected.times, facts: input.facts.length }, story)` from `tokens.ts` is not empty | capability |

S11 in words. A checked token is a word of the story, with the punctuation at its ends removed, that holds a digit, an underscore, an `@`, a lower-case letter followed by an upper-case one, or a dot between two runs of two or more letters. A checked token passes when it is a fact id of the document, a time or date the document shows, a number that appears in the ledger (leading zeros and a unit glued to the number ignored; day, month and year of a shown date count), or a part of a ledger token cut at non-alphanumeric characters (`handler.ts` passes for `src/refunds/handler.ts`). Anything else is a breach, and the report lists the tokens.

S11 is approximate, and the plan's "no name or number outside the allowed set" cannot be decided fully by code:
- It misses numbers written as words and invented names that are plain words. SJ1 covers those.
- It can fail a correct story: a count the model made itself ("two of the three checks"), a number glued to a unit the ledger writes apart in another form, a thousands separator written with a dot. A configuration that fails S11 on an item must be read token by token before it is called a breach.

S7 for a verbatim copy is an upper bound on merge recall: a copy is the easiest duplicate there is.

S10 can also fail a defensible merge: two filler facts that a reader would call the same. `check-dataset.ts` proves that no two open facts share their text outside the planted pairs, not that no reader would merge any other pair. An item that every configuration fails on S10 is first a suspect item.

### Judge

One call per parsed answer, `claude-sonnet-5-5` through the Claude Agent SDK, blind to the configuration. The judge sees: the document the model saw without the `<rubric>` element, the story, and the notes named per criterion. It returns pass or fail per criterion with a quote from the story or the ledger as evidence. The burden of proof is on passing: when the judge cannot decide, it fails the criterion. A pass whose quote is in neither the story nor the ledger is `missing`.

| Id | Question, word for word | Notes shown | Breach | Applies to | Kind |
|---|---|---|---|---|---|
| SJ1 | "List every statement in the paragraph that no fact in the ledger supports (an event, a decision, a reason, a name, a number, a status). Pass only if the list is empty." | none | one statement without a fact. Saying less than the ledger is not a breach. | all | capability |
| SJ2 | "Does the paragraph present as true now, as the plan, or as still pending, anything that the ledger holds only in a fact closed as wrong, superseded or answered? Pass only if it does not. Telling it as past (first X, then replaced by Y) is a pass." | `closed_ids` with `must_not_say` | one such statement | all; the planted cases are the 9 items with `closed_ids` | capability |
| SJ3 | "An open fact in section needs waits on the operator. Does the paragraph say what the operator has to do or decide? Pass only if it does." | `waiting_on_operator.gist` and ids | the paragraph does not mention it, or mentions that something waits without saying what | the 5 items with `waiting_on_operator`; empty mark elsewhere | capability |

The notes are reference answers written by the same model that wrote the dataset. They help the judge find the planted case; they are not shown for SJ1, which must hold for the whole ledger.

The Sonnet judge is validated only by Part B of `evals/judge-agreement`. Until that report gives SJ1 to SJ3 a Wilson lower bound of 0.70 on both rates, every report of this eval prints them as "judge, not validated". On the two `claude-sonnet-5-5` rungs the judge grades its own model; the report flags it.

### Regression and capability

S1 to S6 are the contract: a working configuration is expected to pass them on nearly every answer, and a breach is a defect of that configuration. S7 to S11 and SJ1 to SJ3 are capability criteria: they are what separates configurations. If a capability criterion passes on every item for every configuration, it is saturated on this set and says nothing about which configuration is better; the report says so. The 4 plain items exist to show that.

## 4 Configurations

From `evals/lib/ladder.ts` (`ladder(shipped)`); every (model, effort) pair is one that `v2/sdk-facts.md` verified.

| Name | Backend | Model | Effort | |
|---|---|---|---|---|
| `codex-luna-medium` | codex | `gpt-6-luna` | medium | **shipped**, most likely: see below |
| `claude-haiku-medium` | claude | `claude-haiku-5-5` | medium | |
| `claude-sonnet-medium` | claude | `claude-sonnet-5-5` | medium | judged by its own model |
| `claude-sonnet-high` | claude | `claude-sonnet-5-5` | high | judged by its own model |
| `codex-luna-low` | codex | `gpt-6-luna` | low | |
| `codex-sol-medium` | codex | `gpt-6.1-sol` | medium | |

Shipped: the plugin's default for this job is `{ by: 'recap', model: '', effort: 'medium' }` (`CURATE_DEFAULT`, `tab-recap/src/recap/domain/job.ts`): the recap job's backend at medium effort. The inventory counts 2545 of 2707 stored recap runs on `codex/gpt-6-luna`. The store does not record which model wrote a story, so this is the most likely shipped configuration, not a verified one.

Production runs it through the plugin's codex harness; here it runs through the Codex SDK. The instructions and the document are the same bytes; the transport is not.

If the run must shrink, drop `claude-sonnet-high`, then `codex-luna-low` (`dropOrder` in `config.json`); never an item.

## 5 Run

- 3 repetitions. 24 items x 6 configurations x 3 = 432 job calls; at most 432 judge calls (one per parsed answer).
- An item passes a criterion for a configuration when all 3 repetitions pass; the items that flip are listed.
- Reported per criterion and configuration: k of n with a Wilson 95 % interval, on the answers the criterion applies to. Each configuration is paired with the shipped one on the same items, with the 2 x 2 table and exact McNemar.
- Reported per configuration: calls, input, output and reasoning tokens, seconds, and cost where the SDK reports it.
- Outputs go to `~/.local/state/tab-recap-evals/suite/curator-story/runs/<label>/`, never into the repository.
- The stub answer for an item, for a run without a model: the expected merges (for a verbatim pair close the later fact into the earlier; for a reworded pair close the weaker into `keep`) and a story made of the goal fact's text.

## 6 What a run can and cannot show

Can show:
- Which configurations break the contract (S1 to S6), on which item ids.
- Which configurations miss a planted duplicate, merge a near pair, tell a closed fact as current, or leave out what waits on the operator, by item id.
- A difference between two configurations of about 25 points or more on a criterion that applies to all 24 items.
- Whether results change with ledger size (5 large items: a list of named items, not a rate).
- Calls, tokens, seconds and cost per configuration.

Cannot show:
- That the expected answers are right. A model wrote them and nobody audited them. An item every configuration fails is first a suspect item.
- How often any of these failures happens in real use. The cases are planted, not sampled.
- A pass against a bar. 24 items give a Wilson interval of 30 to 40 points; S7 applies to 10 items, S9 and SJ3 to 5, S8 to 4 at most. Those rows are lists of named misses.
- Recall on duplicates in general: 7 of the 11 planted pairs are verbatim copies.
- That mocked ledgers behave like real ones: the filler is regular and the largest item is far below the largest real task.
- Anything about a story in Spanish beyond 3 items.
- That the judge agrees with the owner. `judge-agreement` Part B measures agreement with planted labels only.
- An independent grade of the two `claude-sonnet-5-5` rungs on SJ1 to SJ3.
- A best configuration beyond this set. Once a configuration is chosen on it, it is a development set.

## 7 Files

| File | What |
|---|---|
| `SPEC.md` | this document |
| `config.json` | the same facts as data: input builders, ladder, criteria, plants, sizes |
| `dataset.jsonl` | the 24 items |
| `build-dataset.ts` | writes `dataset.jsonl`; `cd evals && bun curator-story/build-dataset.ts` |
| `check-dataset.ts` | checks it; `cd evals && bun curator-story/check-dataset.ts` |
| `tokens.ts` | the token check of S11, used by the builder, the check and the grader |

`check-dataset.ts` proves, per item: the line parses; item ids and fact ids are unique; `curatorInput` builds a document from it with `RUBRIC.items`; the facts are in `allOf` order with consistent times and closed fields, and every decision has a reason; every `merge_pairs` pair is two open facts of one section (a verbatim pair with equal text and reason, a reworded pair with different text and a `keep` inside the pair); every `no_merge` pair is two open facts with different text; no two open facts share their text outside the planted pairs; `waiting_on_operator.ids` are exactly the open `needs` facts; every `closed_ids` entry is a fact closed as wrong, superseded or answered and its `current` is open; every checked token of the ledger and every time of the document passes the S11 check, and an invented id, name, host, time and number fail it; `curationOf` accepts the expected merges without a refusal and refuses a merge of a closed fact; `config.json` states the same item, plant and size counts.

Last run, 2026-11-13: 24 items, all checks passed. sha256 of `dataset.jsonl`: `ee9ba0c0cb15b8cdade360ae506dfaebc3a63619c70afb673e9faf2c98ff257d`.
