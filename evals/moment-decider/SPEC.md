# Eval spec: moment-decider (autocompact moment decider, inventory 7)

The expected answers were written by a model and audited by nobody yet. Every report of this eval must repeat that sentence.

## 1 The job under test

At a turn end the plugin builds a state of the lane, asks six questions about it and gets six probabilities; a fixed rule turns them into `compact`, `wait` or `undecided`. All of it is imported unchanged; only the transport changes.

| Step | Plugin code (under `tab-recap/src/`) | Used here as |
|---|---|---|
| Input builder | `recap/application/autocompact-state.ts` `autocompactState(recent, history)` | `input.recent` (`Entry[]`) and `input.history` (`HistoryFact[]`) of each item go in as they are |
| Questions | `recap/application/autocompact-questions.ts` `QUESTIONS` | unchanged |
| Prompt | `adapters/job/decider.ts` `deciderInstructions(QUESTIONS)` | `system`; 2608 characters |
| Document | `JSON.stringify(state)`, as `HarnessDecider.ask` does | `user` |
| Parser | `adapters/job/decider.ts` `probabilitiesOf(text, Object.keys(QUESTIONS))` | `null` is `unparsed` |
| Gate | `recap/domain/autocompact-verdict.ts` `verdictOf(answers)` with `THRESHOLDS` (safe 0.30, closes 0.70, band 0.35 to 0.65) | the verdict that is scored |

Cost of an error: compacting while the agent is mid-work, waits for a job, has asked a detailed choice or holds exact text is the costly one; waiting at a safe moment is cheap. The two are reported apart everywhere.

## 2 Dataset (`dataset.jsonl`, 24 items)

One JSON object per line: `id`, `plants` (the first is the primary plant), `tags` (`size:`, `difficulty:`, `project:`, `verdict:`), `input` (`{recent, history}`), `expected`.

`expected`:
- `answers`: for each of the six question ids, `"true"`, `"false"` or `"open"`. `open` means the case is deliberately unclear and that question is not scored on that item (4 of 144: `needs_verbatim` on md-04, md-11, md-12, md-24).
- `verdict`: `compact` or `wait`. It is what the plugin's own `verdictOf` returns for the expected answers (true as 1, false as 0), and `check.ts` proves that it is the same for every value of an `open` answer.
- `evidence`: quotes, each with the question it supports and the state field (`last_prompt`, `last_reply`, `recent_turns`, `goal`, `open_work`) it must be found in. Every `true` answer has at least one. `check.ts` builds the state with the plugin's builder and finds every quote in its field.
- `note`: why the case is what it is.

Content is invented: six fictional projects (`orchard-api`, `lantern-ui`, `kestrel-sync`, `pebble-ci`, `marrow-db`, `tidewater-docs`), hosts under `.test`, no real path, person, host or project name (`check.ts` greps for them). `build.ts` writes the file: the planted tail of each conversation and the open ledger facts are written by hand; earlier conversation entries and closed, done, decision, link and rule facts are filler from seeded templates. The filler is invisible to the decider by the builder's own rules (it shows the last 6 entries, the last prompt, the last reply, the open goal and at most 12 open `now`, `next`, `needs` facts), and is there so the input has the size and section mix of a real lane.

Plants (primary, as v2/plan.md 3.6):

| Plant | Items | Expected verdicts |
|---|---|---|
| `mid-work` (a command or job still running, or the agent says it carries on) | md-01 to md-05 | 5 wait |
| `finished-idle` | md-06 to md-10 | 5 compact |
| `waiting-on-operator` | md-11 to md-14 | 2 wait (options described only in the reply), 2 compact (options in the operator's own words; an optional offer to go on) |
| `verbatim` (text that must survive word for word) | md-15 to md-19 | 4 wait, 1 compact (exact text present but recoverable) |
| `just-compacted` | md-20, md-21 | 1 wait, 1 compact |
| `long-idle-unfinished` | md-22 to md-24 | 1 compact, 2 wait |

Totals: 14 wait, 10 compact. Sizes: 7 small (3 to 7 entries, 0 to 10 facts), 10 medium (18 to 24 entries, 23 to 45 facts), 7 large (60 to 95 entries, 78 to 158 facts). State documents are 636 to 3806 bytes.

Secondary plants, each a known way to get this job wrong:
- `closes-but-unsafe` (md-12, md-16, md-17): the request is delivered, yet one other question must hold the verdict at wait. md-16 is the sharpest: `needs_verbatim` is the only blocker.
- `reply-opens-with-done` (md-05): the reply starts "Done with" and is a partial result.
- `long-reply-clipped` (md-05, md-08, md-12): the reply is over 1800 characters, so the state shows its first 600 and last 1200.
- `prompt-outside-recent-turns` (md-03): the prompt is 16 entries back; it reaches the model only as `last_prompt`.
- `open-work-over-twelve` (md-08): 17 open items, 12 shown.
- `no-goal` (md-10): empty ledger; `changes_subject` is false by the question's wording.
- `changes-subject` true (md-01 wait, md-09 and md-21 compact); `stuck` true (md-04, md-24); `detailed-choice` true (md-11, md-12, md-24).
- `options-from-operator` (md-13), `optional-offer` (md-14), `exact-text-recoverable` (md-18): the near misses where the unsafe-looking answer is false.
- `stopped-partial` (md-19, md-23, md-24): the agent stopped without finishing. md-23 has all six answers false.

Easy items, so a saturated criterion shows: md-02, md-06, md-07, md-09, md-11, md-15, md-20 (`difficulty:easy`).

Expected sides per question (true / false / open): `closes_request` 14 / 10 / 0; `announces_continuation` 7 / 17 / 0; `asks_detailed_choice` 3 / 21 / 0; `needs_verbatim` 4 / 16 / 4; `changes_subject` 3 / 21 / 0; `stuck` 2 / 22 / 0.

### What the real data gave (shape only)

Read from the snapshot through `sqlite3 -readonly`, counts and lengths only:
- `autocompact_decision`: 433 rows; compact 99, wait 140, undecided 7, unknown 187. Decider label: `codex · gpt-6.1-sol · low` 395, `codex · gpt-6-luna · low` 19, none 19.
- No decision row keeps its input state, so the size of a real state document could not be measured. The mocked sizes follow the builder's limits and the ledger: 38 facts per task on average (maximum 1281); 8 open `now`, `next`, `needs` facts per task on average (maximum 257); fact text of 68 to 89 characters on average per section, links about 30.
- Tool entries are written as the plugin's transcript reader writes them (`adapters/transcripts/tool-calls.ts`): the call only (a command cut at 64 characters, a file path, or an empty text with a `what` description), never the output.

### Three facts about the input the owner should know

They come from reading the builder, and they shape what this eval can plant:
1. Tool output never reaches the state. "Error output, a diff, command output" (the wording of `needs_verbatim`) can be in `recent_turns` only when the agent or the operator quoted it. Every verbatim item here does that.
2. `recent_turns` cuts each turn at 600 characters; `last_reply` keeps up to 1800. `needs_verbatim` asks about material "only in `recent_turns`", while a long reply's exact text is in `last_reply` only. md-12 leaves `needs_verbatim` open for that reason.
3. The state carries no time and no sign of an earlier compaction. `just-compacted` and `long-idle-unfinished` are visible to the decider only through what the text says (a continuation brief as the prompt; a reply that stops). The idle items carry old `at` values in `input.recent`, which the builder drops. md-21 and md-22 are therefore `compact` by the six questions; whether compacting then is useful is decided by the share gate, outside this job.

## 3 Criteria

All graders are code. There is no judge call in this eval.

Per answer, `p` is the parsed object, `v = verdictOf(p)`, `e` the item's `expected`. A mark is pass, fail, or not applicable (outside n). A transport failure is missing (outside n), never a fail. An unparsed answer fails every criterion.

| Id | Criterion | Grader | Breach | Applies to | Type |
|---|---|---|---|---|---|
| C1 | Contract form | `probabilitiesOf(text, ids) !== null` | not one JSON object with a number in [0, 1] for each of the six ids | all 24 | regression |
| C2 | No compaction at an unsafe moment | `v !== 'compact'` | `v === 'compact'` where `e.verdict === 'wait'` | the 14 wait items | regression |
| C2M | No compaction mid-work | C2 on items whose `plants` include `mid-work` | as C2 | md-01 to md-05, md-15, md-20 (7) | regression |
| C3 | Safe moment found | `v === 'compact'` | `wait` or `undecided` where `e.verdict === 'compact'` | the 10 compact items | capability |
| C4 | Verdict as expected | `v === e.verdict` | any other verdict (`undecided` is a breach on both sides) | all 24 | capability |
| C5 | Every scored question on the expected side | for each id with `e.answers[id]` not `open`: `p[id] > 0.5` when true, `p[id] < 0.5` when false | any scored question on the wrong side, or exactly 0.5 | all 24 | capability |
| Q_<id> | One question on the expected side (six criteria) | the C5 test for that id alone | wrong side or 0.5 | items where that id is not `open` | capability |
| C6 | No confident wrong answer | no scored id with `p[id] < 0.1` when true or `p[id] > 0.9` when false | one or more | all 24 | capability |

Reported only, no pass mark (computed from `answers.jsonl` after the run, not a mark of `grade`):
- `verdict_stable`: per configuration, the items whose verdict is the same in all 3 repetitions; the others listed with their verdicts. The library's flip lists on C2, C3 and C4 show the same thing per criterion.
- `undecided_rate`: answers with `v === 'undecided'` out of parsed answers (stored data: 7 of 246 answered).
- `brier`: mean of `(p[id] - label)^2` over scored questions, per question and overall, label 1 for true and 0 for false.

How to read them:
- C2 and C2M are the costly error. Any breach is named with its item and its six probabilities in the report. A configuration with a C2 breach on an item that every other configuration passes is worse than the shipped one, whatever else it wins. An item that every configuration fails is first a suspect item (see the audit sentence).
- C3 is the price of caution: a configuration that answers 0.5 everywhere passes C2 and fails C3 on all 10.
- C4 is the paired comparison criterion (exact McNemar against the shipped configuration on item-level passes).
- C5 and Q_<id> say which question a configuration gets wrong. With 2 to 4 true items for four of the six questions, a Q row is a list of named misses, not a rate.
- Saturation: if C1, and C2 on the easy items, pass for every configuration, they are regression checks from then on and say nothing about which configuration is better.

## 4 Configurations

From `evals/lib/ladder.ts` (`ladder(shipped)`), every (model, effort) pair verified in `v2/sdk-facts.md`:

| Name | Backend | Model | Effort | |
|---|---|---|---|---|
| `codex-sol-low` | codex | `gpt-6.1-sol` | low | **shipped**: the label on 395 of 414 stored decisions that name a decider |
| `claude-haiku-low` | claude | `claude-haiku-5-5` | low | added to the shared ladder for this eval: the configuration the plugin's earlier experiment (EXP-002, per `evals-plan/moment-decider.md`) chose |
| `claude-haiku-medium` | claude | `claude-haiku-5-5` | medium | |
| `claude-sonnet-medium` | claude | `claude-sonnet-5-5` | medium | |
| `claude-sonnet-high` | claude | `claude-sonnet-5-5` | high | |
| `codex-luna-low` | codex | `gpt-6-luna` | low | the label on 19 stored decisions |
| `codex-luna-medium` | codex | `gpt-6-luna` | medium | |
| `codex-sol-medium` | codex | `gpt-6.1-sol` | medium | |
| `codex-terra-medium` | codex | `gpt-6.1-terra` | medium | |

That is 8, two more than the 6 of v2/plan.md. It is affordable here because this eval makes no judge call and its inputs are under 4 kB. If the run must shrink, drop `codex-luna-medium` first, then `claude-sonnet-high` (`dropOrder` in `config.json`); never an item.

Production runs the shipped model through the plugin's codex harness adapter; here it runs through the Codex SDK. The prompt and document are the same bytes; the transport is not, and a difference from the stored decisions can come from it.

## 5 Run

- 24 items x 8 configurations x 3 repetitions = 576 job calls, 0 judge calls.
- The first 12 calls measure seconds, tokens and (Claude only) cost per call; the report gives calls, tokens, seconds and cost per configuration. Stored latency of the shipped decider is a mean of 6.4 to 7.2 s per `evals-plan/moment-decider.md`.
- Outputs: `$HOME/.local/state/tab-recap-evals/suite/moment-decider/runs/<label>/`.
- Stub: the stub answer for an item is the expected answers as 0.95, 0.05 and 0.5 (open), so a stub run passes every criterion and proves the grader, not a model.
- `spec.ts` (to be written against `evals/lib/types.ts`): `prompt(item)` returns `{ system: deciderInstructions(QUESTIONS), user: JSON.stringify(autocompactState(item.input.recent, item.input.history)) }`; `grade` uses `probabilitiesOf` and `verdictOf`; `judge: null`.

## 6 What a run can and cannot show

Can show:
- Which configurations break the contract (C1), and how often.
- Which configurations compact on a planted unsafe case (C2), named item by item, and which miss a planted safe one (C3).
- Which question each configuration gets wrong on which plant.
- A difference between two configurations of about 25 points or more on C4 over 24 paired items; whether a verdict flips between repetitions.
- Calls, tokens, seconds and cost per configuration.

Cannot show:
- How often the decider compacts at an unsafe moment in real use: the cases are chosen, not sampled, and 14 unsafe items with 0 breaches still leave a Wilson upper bound near 22 %.
- That the expected answers are right: a model wrote them and nobody audited them. The hard items (md-05, md-12, md-13, md-16, md-17, md-18) are the first to audit; md-13, md-18, md-21 and md-22 expect `compact` on cases a careful reader could argue.
- Calibration: 24 items, 2 to 4 true cases for four questions; the Brier score is a number to track, not a finding.
- Anything about `stuck` beyond two cases, or about thresholds: `THRESHOLDS` are used as shipped and not varied.
- That mocked states behave like real ones: no real state was ever stored to compare with.
- Behaviour on the real harness path, on Codex lanes versus Claude lanes, or the 187 of 433 stored decisions that ended `unknown` (harness exits): the SDK transport replaces what failed there.

## 7 Files

- `SPEC.md`, `config.json`, `dataset.jsonl`.
- `build.ts`: writes `dataset.jsonl` (`bun run build.ts`); the cases are in it as data.
- `check.ts`: `bun run check.ts` parses every item, validates entry and fact shapes against the plugin's types and section ids, builds the state with `autocompactState`, checks the six expected answers, proves `expected.verdict` with `verdictOf`, finds every evidence quote in its state field, feeds a well-formed answer through `probabilitiesOf`, checks unique ids, plant counts against `config.json`, and the absence of real-looking names and domains. Last result: `ok: 24 items`.
