# Eval spec: coverage-check

The coverage check is the decider that reads a compaction brief and the open facts of a lane and answers, per fact, the probability that the brief keeps it (inventory 6). A fact of a blocking section (goal, needs, decisions, rules) that scores under the pass mark 0.70 counts as missed; a miss triggers one rewrite, then the facts are appended or the compaction is blocked.

**Expected answers in this dataset were written by a model and audited by nobody yet.** Every report of this eval must repeat that sentence. An item that every configuration fails is first a suspect item, not a model failure.

## 1 What is under test, and what is not changed

| Piece | Source, imported unchanged |
|-|-|
| Input builder | `factsOf(history)` in `tab-recap/src/recap/application/brief-coverage.ts` (open facts of the six covered sections, first 40) |
| Questions | `questionsFor(facts)`, same file: `keeps_N` per fact, `reason_N` per decision that has a reason |
| Prompt | `deciderInstructions(questions)` in `tab-recap/src/adapters/job/decider.ts` as the system text; `JSON.stringify({ brief, facts })` as the user text, with `facts` mapped to `{section, text, why}` exactly as `covered()` does |
| Parser | `probabilitiesOf(reply, ids)`, same file |
| Gate | `missingOf(answers, facts, 0.70)` and `KEPT_AT_LEAST` in `brief-coverage.ts` |

Only the transport changes: the Codex SDK and the Claude Agent SDK on the machine's logins, as `evals/lib/` provides them. No judge call: every criterion has a fixed form and is decided by code.

Costly error: the decider says "kept" for a fact the brief dropped, so the agent loses it after compaction. Cheap error: it says "missing" for a kept fact, which costs a rewrite, appended text or a blocked compaction.

## 2 Dataset (`dataset.jsonl`, 24 items, 444 questions)

Fully mocked: six invented projects (`orchard-api`, `quarry-etl`, `lantern-ui`, `kestrel-sync`, `tidewater-infra`, `marrow-firmware`), hosts under `.test`, no real path, person, host or project. Shape follows the real store, read for counts and lengths only (15 stored briefs: 2,663 to 2,982 characters, one paragraph, no lists; 14 to 40 facts each; fact text about 80 characters on average, at most about 150; every open decision has a reason).

One JSON line per item:

- `id`, `plants`, `tags` (`size:small|medium|large`, `project:<name>`, and `brief-project:<name>` when the brief is another project's).
- `input`: `{ brief, history }`. `history` is a list of `HistoryFact` (`section, text, why, state, closedWhy, closedAt, firstAt, lastAt`), the exact argument of `factsOf`. The eval builds the prompt as section 1 says.
- `expected`:
  - `questions`: one entry per question id that `questionsFor(factsOf(history))` produces: `{ kept, how, fact }`. `kept` is the expected side of the pass mark. `how` is the construction: `literal`, `paraphrase`, `absent`, `vague`, `detail-changed`, `foreign` for `keeps_N`; `reason-literal`, `reason-paraphrase`, `reason-dropped` for `reason_N` (or `absent` / `foreign` when the decision itself is not in the brief). `fact` is the id of the fact in the bank (`dataset/bank.ts`).
  - `ok`: the brief verdict; `missing`: `[{index, parts}]`, what `missingOf` returns on a perfect answer; `facts_asked`; `not_asked` (facts beyond the cap of 40); `pass_mark` 0.70; `note`.

How each construction is made (`dataset/build.ts`), and what makes the expected answer hold:

| `how` | In the brief | Expected | Questions |
|-|-|-|-|
| `literal` | the fact text word for word | kept | 31 |
| `paraphrase` | a rewording that carries every key name, path and number of the fact | kept | 223 |
| `absent` | nothing: none of the fact's keys occur in the brief | not kept | 42 `keeps` |
| `foreign` | nothing: the fact belongs to another project than the brief | not kept | 50 `keeps` |
| `vague` | a sentence that gestures at the fact with none of its keys | not kept | 9 |
| `detail-changed` | the rewording with one number or name replaced by another | not kept | 6 |
| `reason-literal`, `reason-paraphrase` | the reason word for word, or reworded with its key detail | kept | 7 + 57 |
| `reason-dropped` | the decision, without its reason | `keeps_N` kept, `reason_N` not kept | 8 |

The remaining 11 `reason_N` questions belong to decisions that are absent or foreign: expected not kept.

Sizes: 7 small (6 or 7 facts, briefs of 460 to 590 characters), 11 medium (12 to 14 facts, 850 to 1,140 characters), 6 large (24 to 40 facts, 2,070 to 2,700 characters; the largest prompt is about 22,000 characters). Verdicts: 9 briefs pass, 15 miss. The real store has 1 of 15 passing: passing briefs are over-represented here on purpose, so "a good brief is blocked" can be measured.

Plants (inventory 6 and plan v2 section 3.5):

| Plant | Items |
|-|-|
| Fact copied word for word (easy, kept) | cc-01, cc-02, cc-03; parts of cc-11, cc-16 |
| Another project's brief against the facts (easy, not kept) | cc-04, cc-05, cc-06 |
| Fact kept in other words | cc-07, cc-08, cc-09 and most other items |
| Fact absent | cc-10, cc-11, cc-12, cc-16, cc-20 to cc-23 |
| Decision kept without its reason | cc-13, cc-14, cc-16, cc-19; control with every reason kept: cc-15 |
| Fact gestured at without its detail | cc-16, cc-17, cc-19, cc-23 |
| Fact stated with a changed number or name | cc-11, cc-18, cc-19 |
| Just over and just under the gate | cc-20 and cc-21; cc-22 and cc-23 |
| Another task's fact in the same ledger | cc-24 |
| More than 40 open facts, settled facts and `done` / `links` rows in the history | cc-12 (44 open, 8 other rows); cc-16 (4 other rows) |

"Just over and just under" needs a word. The plan says "a brief that keeps just under and just over 70 %", but 0.70 is a mark on each answer, not a share of facts: one blocking fact under the mark is a miss. The pairs are built on that rule. cc-20 and cc-22 leave out only facts of sections that do not block (`now`, `next`) and pass; cc-21 and cc-23 are the same briefs with one blocking fact left out or gestured at, and miss.

Check and rebuild, from `evals/`:

~~~~sh
bun coverage-check/dataset/build.ts
bun coverage-check/dataset/check.ts
node_modules/.bin/tsc -p coverage-check/tsconfig.json
~~~~

`check.ts` proves, for every item: it parses; ids are unique; every history row has the `HistoryFact` fields and a valid section; `factsOf` and `questionsFor` accept it and give exactly the question ids in `expected.questions`; `deciderInstructions` lists each question; `probabilitiesOf` accepts a perfect answer; `missingOf` on that answer equals `expected.missing` and `expected.ok`; each expected entry points at the fact at its index; each construction holds in the text (a literal fact is in the brief; a paraphrase carries every key and is not the literal text; no key of an absent, foreign or vague fact occurs in the brief; a changed fact lacks at least one key; a dropped reason has none of its keys in the brief). It also proves that every key is unique to its fact across the bank, and that no item holds a real name, a home path or a host outside `.test`. Last run 2026-11-13: 24 items, 444 questions, all checks pass. Dataset sha256 `7f1952ec174e128f944c55a884527e0a4e843c1e3330f07acc1b73960280da2a`.

What `check.ts` cannot prove: that a paraphrase really says the same thing, or that a vague sentence really is too vague. Those are the model-written judgments nobody has audited.

## 3 Criteria

All decided by code at the plugin's pass mark 0.70. A question is right when its probability is at or above 0.70 and `kept` is true, or under 0.70 and `kept` is false. Each criterion gives one mark per answer (one item, one configuration, one repetition): pass when every question of its class in that item is right; no mark (outside n) when the item has no question of that class or the call failed in transport. An answer the parser refuses fails every criterion (`unparsed`).

| # | Criterion | Questions it reads | Breach | Kind | Questions, items |
|-|-|-|-|-|-|
| C1 | Answer shape | `probabilitiesOf(text, ids)` | not one number in [0, 1] per question id | regression | all, 24 |
| C2 | Literal fact kept | `keeps_N` with `how` `literal` | under the mark | regression | 31, 5 |
| C3 | Foreign fact not kept | `keeps_N` with `how` `foreign` | at or above the mark | regression | 50, 4 |
| C4 | Kept facts found | `keeps_N` with `kept` true | under the mark | capability | 254, 21 |
| C4p | of which reworded | `how` `paraphrase` | under the mark | capability | 223, 18 |
| C5 | Dropped facts caught (headline) | `keeps_N` with `kept` false | at or above the mark | capability | 107, 15 |
| C5a | of which plainly absent | `how` `absent` | at or above the mark | capability | 42, 8 |
| C5n | of which near misses | `how` `vague` or `detail-changed` | at or above the mark | capability | 15, 6 |
| C6 | Reasons | every `reason_N` | wrong side of the mark | capability, reported only | 83, 24 |
| C6d | of which dropped reasons | `how` `reason-dropped` | at or above the mark | capability | 8, 4 |
| C7 | Stable | every question, over the 3 repetitions | a question changes side of the mark | regression | 444, 24 |
| C8 | Brief verdict | `missingOf(answers, facts, 0.70).length === 0` against `expected.ok` | differs | capability | 24 items |
| C8a | A bad brief is not passed | C8 on the 15 items with `ok` false | verdict ok | capability, the costly error | 15 items |
| C8b | A good brief is not blocked | C8 on the 9 items with `ok` true | verdict miss | capability | 9 items |

C7 is not a per-answer mark. The library reports, per criterion and configuration, the items that pass in all 3 repetitions and the items that flip; C7 is read from those flips, and at question level from `questions.csv` below.

Saturation: C1, C2 and C3 are the easy criteria. A configuration that passes all of them shows only that it reads the task; a failure there is a regression. The capability criteria are C5, C5n, C6d and C8a.

Besides the library's outputs, the eval writes `questions.csv` in the run directory (id, config, repetition, question, how, expected kept, probability, right) and reports from it, with no extra call:

- the rates of C2 to C6d pooled over questions, with Wilson 95 % intervals, flagged as optimistic because questions cluster in 24 briefs;
- the same rates at marks 0.60, 0.70 and 0.75 (the three style marks of `autocompact-style.ts`), and a sweep from 0.30 to 0.95 by 0.05;
- AUC of the probability against `kept`, per configuration;
- confident wrong answers (0.9 or more on a not-kept question, 0.1 or less on a kept one), listed;
- questions that change side between repetitions (C7).

Stub mode (`--stub`): no model call; each question answers 0.9 when `kept` and 0.1 when not, with a deterministic few flipped per configuration so that the report shows failures.

## 4 Configurations

From `v2/sdk-facts.md`: every model and effort below was accepted by its login on 2026-11-13.

| Name | Backend | Model | Effort | |
|-|-|-|-|-|
| `claude-haiku-low` | Claude Agent SDK | `claude-haiku-5-5` | low | **shipped** |
| `claude-haiku-medium` | Claude Agent SDK | `claude-haiku-5-5` | medium | |
| `claude-sonnet-medium` | Claude Agent SDK | `claude-sonnet-5-5` | medium | |
| `codex-luna-low` | Codex SDK | `gpt-6-luna` | low | |
| `codex-luna-medium` | Codex SDK | `gpt-6-luna` | medium | |
| `codex-sol-medium` | Codex SDK | `gpt-6.1-sol` | medium | |
| `codex-terra-medium` | Codex SDK | `gpt-6.1-terra` | medium | |

Why this one is marked shipped: with no Jev key, `coverageDeciderFor` (`tab-recap/src/daemon/deciders.ts`) uses the decider job, whose default is the writer's harness at low effort with the harness default model (`DECIDER_DEFAULT` in `recap/domain/job.ts`; the claude harness defaults to `haiku` in `recap/domain/backend.ts`). Two limits on that claim:

- With a Jev key, production sends this check to Jev instead. Jev is an outside service and is out of scope here, so the configuration that actually answered the 66 stored coverage rows is not verified and may not be this one.
- The plugin calls the `claude` command line with the alias `haiku`; the eval calls the Agent SDK with `claude-haiku-5-5`. sdk-facts lists them as the same model; the transports differ.

Six configurations is the plan's limit. The shared ladder has `claude-sonnet-high`; it is left out to make room for the shipped rung, because this job is a cheap low-effort decider and the cheaper rungs are the question.

Runs: 24 items x 6 configurations x 3 repetitions = 432 job calls, 0 judge calls. Timeout 180 s per call. A transport failure is missing, never a fail. Calls, tokens, seconds and cost (where the SDK reports it) are reported per configuration. Outputs: `$HOME/.local/state/tab-recap-evals/suite/coverage-check/runs/<label>/`.

## 5 What the run can show, and what it cannot

Can show:

- Which configurations break the answer contract, pass a brief that dropped a blocking fact, or block a brief that kept everything.
- A difference of about 25 points or more between two configurations on the 24 paired items (exact McNemar against the shipped configuration).
- Per configuration, the trade between catching dropped facts (C5) and finding kept ones (C4) at marks 0.60, 0.70 and 0.75.
- Whether an answer is stable over 3 repetitions.
- Calls, tokens, seconds and cost per configuration.

Cannot show:

- How often the decider is wrong in real use: every case is planted, and paraphrases written by one model may be easier or harder to recognise than a real brief's.
- That the expected answers are right. The near-miss classes (`vague`, `detail-changed`, 15 questions) and the 8 dropped reasons rest on a model's judgment of what "the detail needed to act on it" is.
- A pass against a bar: 24 items give intervals of 30 to 40 points; C5n has 6 items, C6d has 4, C8b has 9.
- Anything about Jev, the backend production prefers for this check.
- Anything about briefs in another language than English, or briefs over 3,000 characters.
- A best configuration beyond this set: once one is chosen on these items, they are a development set.
- Question-level intervals that mean what they say: the 444 questions sit in 24 briefs and 122 distinct facts, many reused across items.
