# Eval spec: judge-agreement (the plugin's judge, inventory 8, and the suite's Sonnet judge)

The expected answers were written by a model and audited by nobody yet. Every report of this eval must say so.

Paths starting with `tab-recap/` are the plugin; nothing there is changed. Everything else is in `evals/judge-agreement/`.

This eval has two parts. Part A is built and checked. Part B is specified here and not built (section 7 says why).

## 1 The job under test (Part A)

`tab-recap eval` scores a stored writer run. For the task `score`, the judge reads the rubric, the writer's input and the items the run added, and answers, for every added item, the seven item checks (I1 to I7) and the check of the item's section, each pass or fail with a one-line critique on a failure. The same answer also lists key facts and their coverage; this eval does not score those.

The eval builds the same call from the plugin's own code. Only the transport changes (Codex SDK, Claude Agent SDK).

| Step | Plugin code, imported unchanged |
|---|---|
| Writer input (what `run_input.document` stores) | `writerContext(item.input.request)` (`tab-recap/src/recap/application/writer-context.ts`), as `recap-job.ts:269` stores it |
| Document (user message) | `scoringDocument({ rubric: RUBRIC_TEXT, input, items: item.input.items, state: item.input.state })` (`tab-recap/src/recap/application/judge-context.ts`, `tab-recap/src/adapters/job/prompts/rubric.ts`), as `judgeRun` builds it |
| Instructions (system message) | `judgeInstructions('score', new Map())` (`tab-recap/src/adapters/job/prompts/judge-instructions.ts`): the shipped prompt with an empty anchor map |
| Fence removal | `unfenced(text)` (`tab-recap/src/adapters/job/prompts/recap-prompt.ts`), as `HarnessJudge.ask` does |
| Parser | `parseScore(unfenced(text), sections, carriers)` (`tab-recap/src/recap/application/judge-answer.ts`); `sections` maps each key of `input.items` to its section, `carriers` each key of `input.state`, as `judgeRun` passes them |

The rubric is read at run time from `RUBRIC_TEXT`, so a rubric change reaches the eval without a dataset rebuild. The anchor map is empty on purpose: anchors are the operator's overrulings, and none exist (the `verdict` table has 0 rows).

Not reproduced: the byte limit of `HarnessJudge.ask` (a document too long for the harness is answered "unreadable" without a call). The largest scoring document here is 61,052 characters.

Cost of an error in production: every number the plugin's own eval prints rests on this judge. A judge that passes a breach hides a writer fault; a judge that fails a clean item sends the owner after a fault that is not there.

## 2 Dataset (`dataset.jsonl`, 24 items, 192 added items)

Fully mocked. Eight invented projects (`orchard-api`, `lantern-ui`, `kestrel-sync`, `marrow-db`, `tidewater-ci`, `quillpress`, `pebble-auth`, `harbor-queue`), three runs each, hosts under `.test`, no real path, person, host or project. Two runs are in Spanish (`ja-13`, `ja-19`).

Written by `build-dataset.ts` from `cases-a.ts` and `cases-b.ts` (deterministic: the same bytes on every run) and checked by `check.ts`. Run both with `bun` from this folder.

One JSON line per item, one item per mocked writer run:

| Field | Content |
|---|---|
| `id` | `ja-NN-<project>-<size>` |
| `tags` | project, size, language, agent kind |
| `plants` | the planted checks of the run, plus `clean` and `clean-reworded` (the `Item.plants` of `evals/lib/types.ts`) |
| `input.request` | a `RecapRequest`: the tab, one agent, the ledger of facts open before the run, one transcript. `writerContext` turns it into the writer input |
| `input.items` | the 8 items the run added, as `DatasetRow` (`key` is `t1/<section>/<position>`, as `the run-input store's itemsOf(run, 'added')` names them) |
| `input.state` | every item open after the run, as `DatasetRow` (`key` is `state/t1/<section>/<position>`): the earlier facts, then the added ones |
| `expected.items` | one entry per added item, below |

Each entry of `expected.items`:

| Field | Content |
|---|---|
| `key`, `section` | the added item |
| `breach` | the one check this item was written to fail (`I1` to `I7`, or `S-<section>`), or `null` |
| `checks` | the 8 checks of the item, each `fail`, `pass` or `open` |
| `why` | one line saying what is wrong, or that the item is clean |
| `support` | the turn or tool output of the input that states the item (`null` for an I4 breach) |
| `contradiction` | for an I7 breach, the later turn that says the opposite |
| `rewords` | for an I6 breach, the key of the added item it rewords |
| `absent` | for an I4 breach, words of the item that appear nowhere in the input |

### How each breach is planted

| Check | The planted item |
|---|---|
| I1 atomic | three results or actions in one line, each of them stated in the input |
| I2 stands alone | the subject is "It", "This", "That", "They" or "The issue" (in Spanish, a left-out subject or "Eso"); the line still names a value or a file, so I3 passes |
| I3 specific | a line with no file, command, reference, value, version, error or role ("Tidy up the error handling.") |
| I4 supported | a specific, well-formed line about something the input never mentions; `absent` lists its words |
| I5 about the work | the subject is the agent: "claude ran", "codex wrote", "The agent chose", "a1 is running" |
| I6 new | a rewording of another added item of the same run |
| I7 still true | the input states the item, and a later turn says the opposite (a failing test that now passes, a question the operator answered) |
| S-goal | an activity, not an outcome |
| S-now | something that already ended |
| S-needs | a musing with no question and nothing blocked |
| S-done | effort, not a result |
| S-decisions | the choice without its reason (the reason is in the input) |
| S-next | "Continue on a branch": no action with an object |
| S-rules | a one-off instruction of the operator |
| S-links | a reference that does not resolve ("the report from before") |

Counts, proven by `check.ts`: 160 added items carry exactly one planted breach, 20 per check (the 20 section breaches: done 3, needs 3, next 3, now 3, decisions 2, goal 2, rules 2, links 2). 32 are clean: 12 pass all 8 checks, 20 are the original of an I6 rewording.

Cells (one added item and one check) by expected mark:

| | I1 | I2 | I3 | I4 | I5 | I6 | I7 | section |
|---|---|---|---|---|---|---|---|---|
| must fail | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 |
| must pass | 168 | 168 | 170 | 172 | 168 | 152 | 172 | 152 |
| open (not scored) | 4 | 4 | 2 | 0 | 4 | 20 | 0 | 20 |

### Open cells

A cell is `open` where the rubric does not decide it; an open cell is never scored.

- The original of an I6 rewording: I6. The rubric does not say which of two rewordings fails.
- An I3 breach: its section check. A line that names nothing rarely meets a section check either.
- Every item of the section `links`: I1, I2, I5. A bare reference states no fact and has no subject.
- The two S-links breaches: I2 and I3 as well.

### Sizes

Writer input in characters: 6 small (1,533 to 1,924), 12 medium (11,619 to 26,777), 6 large (42,856 to 54,073). The real store, read for sizes only: 492 at the smallest, quartiles 13,540, 27,548 and 110,935, 213,749 at the largest.

Medium and large inputs are padded with generated tool calls and short agent turns about files that no item mentions (`src/<area>/<noun>-NN.ts`, `test/unit/...`). `check.ts` proves that no turn was dropped or clipped by the plugin's transcript budget, that every `support` and `contradiction` is in the built input (the contradiction after the support), that every backticked name of a supported item is in the input, and that no `absent` word is.

### Where the mocked data differs from the real data

- Section mix of the added items: done 126, needs 18, next 17, decisions 11, now 10, links 4, rules 4, goal 2. The real store has done 826 of 2,396 (34 %) and links 309 (13 %): done is over-represented here, links under-represented.
- The real top quarter of inputs is larger than 110,935 characters; the largest here is 54,073. The plugin keeps at most 60,000 characters of transcript; real large inputs get the rest from long ledgers and several lanes. Here every run has one lane and at most 10 earlier facts.
- Every run adds exactly 8 items and 6 or 7 of them are flawed. In the real store 560 of 1,886 runs with added items add one, and 23 add eight. A judge that expects most items to be fine is at a disadvantage here, and one that fails freely is at an advantage; the true-pass rate is the control.
- Clean decision items carry their reason inside the text. In the real store the reason is in the column `why`, and `scoringDocument` prints only `text`: 231 of 232 stored decisions do not contain their reason in the text. On real runs the judge is therefore asked for "the choice and its why" without being shown the why. This is a finding about the plugin, outside this eval; it is not fixed or measured here.

## 3 Criteria (Part A)

All code. No judge call.

| id | Criterion | Grader | Breach | Type |
|---|---|---|---|---|
| J1 | the answer is usable | `parseScore(...)` returns `ok` | `unusable`; the answer is `unparsed` and fails every criterion | regression |
| J2 | the answer is complete | the parsed answer has 64 verdicts: each of the 8 added items with each of its 8 checks, once | a missing cell (`parseScore` drops a verdict with an unknown key, an unknown check, a pass that is not a boolean, or a repeated cell) | regression |
| J3 | the answer is stable | over 3 repetitions of one configuration, per cell | a cell whose verdict differs between repetitions; the report lists the flipping cells and their count per check | regression |
| J4 | the judge agrees with the planted label, per check | per cell: the parsed verdict against `expected.checks` | a must-fail cell passed (a missed breach) or a must-pass cell failed (a false alarm) | capability |

J4 is reported per check (I1, I2, I3, I4, I5, I6, I7, and the 8 section checks pooled as S), never pooled across checks:

- the verdict of a cell is the majority of its repetitions that have one; a cell with no majority or no verdict is missing and is counted apart;
- true-fail rate: must-fail cells judged fail, out of the must-fail cells with a verdict (at most 20), with a Wilson 95 % interval;
- true-pass rate: must-pass cells judged pass, out of the must-pass cells with a verdict, with a Wilson 95 % interval;
- Cohen's kappa over the must-fail and must-pass cells of the check (`cohenKappa` of `evals/lib/stats.ts`);
- the section check also broken down by section, as counts only (2 or 3 planted fails per section show nothing by themselves).

Gating rule, from `judge.md`: a check of a configuration is "agrees with the planted labels" only when it has 20 must-fail and 20 must-pass cells with a verdict, kappa at least 0.6, and the Wilson lower bound of both rates at least 0.70. With 20 must-fail cells: 20 of 20 gives 0.84, 19 of 20 gives 0.76, 18 of 20 gives 0.699 and does not clear it. Otherwise the check is printed as "not shown to agree". This is agreement with labels a model wrote, not with the owner.

For the shared table of `evals/lib` (one mark per answer and criterion), the spec also exports, per check `X`:

- `F_X`: true when the answer fails every must-fail cell of `X` in that run, `null` when the run has none;
- `P_X`: true when the answer passes every must-pass cell of `X` in that run.

These feed the paired McNemar comparison against the shipped configuration at run level (24 runs). The cell-level rates above are the result to read; the implementer computes them from `answers.jsonl` and writes them to `agreement.csv` (configuration, check, must-fail k and n, must-pass k and n, both intervals, kappa, missing cells, flipping cells) and into `report.md`.

Saturation: a check where every configuration reaches 20 of 20 and a true-pass rate of 0.98 or more is marked saturated; it then shows only that the planted breaches of that check are easy.

Stub: the answer built from `expected.checks` (`fail` gives `pass: false`, everything else `pass: true`), with one key fact and one coverage entry. `check.ts` proves `parseScore` accepts it with 64 verdicts for every item.

## 4 Configurations

From `evals/lib/ladder.ts`, whose rungs `v2/sdk-facts.md` verified on this machine's logins. `JUDGE_DEFAULT` (`tab-recap/src/recap/domain/job.ts`) places the judge on the writer's backend with the backend's default model at effort `medium`; `judge.md` names that as codex `gpt-6-luna`, medium.

| Name | Backend | Model | Effort | |
|---|---|---|---|---|
| `codex-luna-medium` | codex | `gpt-6-luna` | medium | shipped |
| `codex-luna-low` | codex | `gpt-6-luna` | low | |
| `codex-sol-medium` | codex | `gpt-6.1-sol` | medium | |
| `codex-terra-medium` | codex | `gpt-6.1-terra` | medium | |
| `claude-haiku-medium` | claude | `claude-haiku-5-5` | medium | |
| `claude-sonnet-medium` | claude | `claude-sonnet-5-5` | medium | |
| `claude-sonnet-high` | claude | `claude-sonnet-5-5` | high | |

Repetitions: 3. Calls: 24 runs x 6 configurations x 3 = 432 job calls, 0 judge calls. If the time does not fit, drop `claude-sonnet-high`, then `codex-luna-low`; never an item.

Each call sends 4,469 characters of instructions and a document of 7,448 to 61,052 characters, and asks for 64 verdicts plus key facts in one JSON object. `v2/sdk-facts.md` did not verify either SDK at this input size or output length; the first 12 calls measure it.

In production the judge runs by default on the writer's own backend: the writer's model grades itself. This eval does not measure that effect; it measures each configuration against planted labels.

## 5 What a run of Part A can and cannot show

Can show:
- per configuration, whether the judge answer parses and is complete at these input sizes;
- per configuration and check, whether the judge finds 20 planted breaches (20 of 20: lower bound 0.84) and leaves at least 152 clean cells alone;
- which checks no configuration separates (a suspect check or suspect labels first, a weak judge second);
- which cells flip between repetitions;
- a difference between two configurations of about 25 points on a check's 20 must-fail cells;
- calls, tokens, seconds and cost per configuration.

Cannot show:
- agreement with the owner: the labels are a model's, audited by nobody. A cell every configuration gets "wrong" is first a suspect label;
- how the judge behaves on real runs: planted breaches are one clear fault per item, written to be clean; real items are messier and the mix of sections differs (section 2);
- anything about coverage, filler or read-back: the tasks `readback`, `grade` and `cover` are not run;
- anything per section check: 2 or 3 planted fails per section;
- a small difference between configurations: 20 cells give intervals of 25 to 40 points;
- the effect of anchors (the map is empty) or of the plugin's byte limit;
- a best configuration beyond this set: once one is chosen on it, it is a development set.

## 6 Run outputs

`$HOME/.local/state/tab-recap-evals/suite/judge-agreement/runs/<label>/`: `prompt.md`, `answers.jsonl`, `results.csv`, `summary.json`, `report.md` from `evals/lib`, plus `agreement.csv` (section 3). Nothing is written into the repository or the plugin's store.

## 7 Part B: the suite's Sonnet judge on its own 13 criteria (specified, not built)

Purpose: before any other report prints a judge criterion as more than "judge, not validated", show that `claude-sonnet-5-5` (effort `medium`, through `evals/lib/judge.ts`) finds planted breaches of that criterion.

The 13 criteria, owned by the other evals: WJ1 to WJ4 (`evals/writer`), SJ1 to SJ3 (`evals/curator-story`), RJ1 (`evals/curator-reconcile`), BJ1 to BJ5 (`evals/compaction-brief`).

Why it is not built: each Part B item is an answer written by hand to an item of one of those four datasets, judged with that eval's own `judge.criteria` and `judge.view`. Those datasets and specs were being written at the same time as this one, so no answer could be written against them. Writing free-standing cases instead would test other wording and another view than the ones the reports use, and the label it produced would not transfer.

To build it (one `dataset-b.jsonl` in this folder):

| Field | Content |
|---|---|
| `id` | `jb-<criterion>-NN` or `jb-<eval>-clean-NN` |
| `eval` | `writer`, `curator-story`, `curator-reconcile` or `compaction-brief` |
| `source` | the id of the item of that eval the answer responds to |
| `answer` | the answer text, in the form that eval's parser accepts (an answer that does not parse gets no judge call) |
| `breach` | the one judge criterion the answer was written to break, or `null` |
| `expected` | for each judge criterion of that eval: `fail`, `pass` or `open` |
| `evidence` | the span of the answer that carries the breach, and the fact or span of the source item it breaks |

Counts, from `v2/plan.md`: 20 breached answers per criterion (260); the breached answers of the other criteria of the same eval are a criterion's passes; RJ1, alone in its eval, gets 20 clean answers; the other three evals get 5 clean answers each (15). That is 295 answers; the plan rounds to 300. One judge call per answer, exactly as `evals/lib/judge.ts` makes it in those evals (criteria and view imported from the sibling `spec.ts`, the configuration absent), plus 2 more repetitions on 50 answers: about 400 judge calls.

Reported per criterion: true-fail rate (of 20) and true-pass rate, each with a Wilson 95 % interval, and kappa. A criterion is validated only under the gating rule of section 3. The result is written as the `--judge-check` file of `evals/lib/cli.ts` (`{"WJ1": true, ...}`); a criterion without `true` stays "judge, not validated" in every other report.

Limits that will hold when it is built: the labels are a model's; the judge is `claude-sonnet-5-5`, so on the `claude-sonnet-5-5` rungs of the other evals it grades its own model, and Part B does not measure that; an answer written by hand to break one criterion is cleaner than a model's real mistake.

Until Part B has run, every judge criterion of the other four evals is advisory.
