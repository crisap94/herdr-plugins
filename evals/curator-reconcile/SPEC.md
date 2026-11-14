# Eval spec: curator-reconcile (curator, reconcile mode, inventory 4)

The expected answers were written by a model and audited by nobody yet. Every report of this eval must say so.

Paths starting with `tab-recap/` are the plugin; nothing there is changed. Everything else is in `evals/curator-reconcile/`.

## 1 The job under test

Every 8 turns, after a compaction, or when the view opens, the plugin sends one task's open facts and the newest turns (at most 12,000 characters) to the curator. The curator may close or update open facts, and must quote the turns for each change. It may never add a fact.

The eval builds the same call from the plugin's own code. Only the transport changes (Codex SDK, Claude Agent SDK).

| Step | Plugin code, imported unchanged |
|---|---|
| Document (user message) | `reconcileInput({ ...item.input, rubric: RUBRIC.items }).document` (`tab-recap/src/recap/application/curator-input.ts`, `tab-recap/src/adapters/job/prompts/rubric.ts`) |
| Instructions (system message) | `RECONCILE_CURATOR_INSTRUCTIONS` (`tab-recap/src/adapters/job/prompts/curator-reconcile-instructions.ts`) |
| Fence removal | `unfenced(text)` (`tab-recap/src/adapters/job/prompts/recap-prompt.ts`), as `HarnessCurator.write` does |
| Parser | `reconciliationOf(unfenced(text), built.facts, built.tail)` (`tab-recap/src/recap/domain/reconciliation.ts`) |
| Gates | `judge(LEDGER_GATES, ops, ground, item.input.clock.now)` (`tab-recap/src/recap/application/ops-gating.ts`, `tab-recap/src/recap/domain/gates/ledger-gates.ts`), with `ops` and `ground` built as `reconcileTask` builds them (`tab-recap/src/recap/application/ledger-reconcile.ts`) |
| Quote test | `quotedIn(quote, text)` (`tab-recap/src/recap/domain/quote.ts`), the test the parser itself uses |

`built` is the value `reconcileInput` returns. `ground` is `{ key: 'k', tab: 't', shown: built.facts, open: [...built.facts.values()], closedLately: [], source: '', language: item.input.language, agents: ['claude', item.input.name.toLowerCase()] }`. The plugin fills `agents` with the lane's agent and title; the eval uses `claude` and the task name.

`item.input` is `ReconcileMaterial` without `rubric`. The rubric is added at run time from `RUBRIC.items`, the value the daemon passes (`tab-recap/src/daemon/curate.ts`).

**Kept operations.** Every criterion from R4 on reads the kept operations: those that the parser accepted and no gate refused. They are what the plugin would write to the ledger. An operation the plugin refuses does no harm and is counted under R2 or R3 only.

Cost of an error in production:
- A still-true fact is closed: an open need or decision leaves the recap silently. This is the costly error.
- A stale fact stays open: finished work shows as pending. This is cheap.

## 2 Dataset (`dataset.jsonl`, 24 items)

Fully mocked. Six invented projects (`orchard`, `tidewater`, `lantern`, `brasswork`, `mossgate`, `kiteline`), hosts under `.test`, no real path, person, host or project. Written by `build-dataset.ts` from `dataset-source/` (deterministic: a second run gives the same bytes) and checked by `check-dataset.ts`.

The plan names the file `dataset/items.jsonl`; this eval follows its brief and the neighbouring evals and uses `dataset.jsonl`.

### 2.1 One JSON line per item

| Field | Content |
|---|---|
| `id` | `rec-NN-<plant>-<case>`, unique |
| `plants` | The planted cases. The first is the primary plant: `stale`, `lookalike` or `compaction`. Others: `easy`, `update`, `duplicate` |
| `tags` | Size (`small`, `medium`, `large`), project, and `no-op-expected` when the right answer has no operation |
| `input` | `{ name, language, clock: { now, zone }, open: Fact[], tail: Entry[] }` |
| `expected` | See 2.2 |

`Fact` and `Entry` are the plugin's types (`tab-recap/src/recap/domain/fact.ts`, `tab-recap/src/ports/transcripts.ts`). Fact ids in `expected` are the document ids (`f1`, `f2`, ...) that the model sees: `fN` is `input.open[N-1]`.

### 2.2 The expected answer

| Field | Meaning |
|---|---|
| `must_close` | `{ id, why, evidence }`: a fact that a real turn of the tail settles. `evidence` is a span of a real turn that states it. `why` lists the fitting reasons; it is not graded by code |
| `must_update` | `{ id, text, evidence }`: a fact that changed and is not finished. `text` is one acceptable new text |
| `must_stay_open` | Ids that no kept operation may close |
| `duplicates` | Pairs of ids that say the same thing. One may be closed as `merged` into the other; no other close of them is right |
| `summary_turns` | Indexes into `input.tail` of the turns that are a summary written after a compaction |
| `summary_spans` | The text of those turns exactly as it stands in the built tail (after the plugin's clipping) |
| `summary_claims` | `{ id, span }`: a span that is only in a summary and says the fact is done, replaced or answered |
| `lookalikes` | `{ id, span }`: a span of a real turn that resembles a settlement of the fact and is not one |
| `note` | One sentence on how the case was built |

Every open fact is in exactly one of `must_close`, `must_update`, `duplicates`, `must_stay_open`.

### 2.3 Plants

Counts by primary plant: 8 each. Counts over all plants of an item: `stale` 13, `lookalike` 13, `compaction` 8.

| Plant | Items | What is planted |
|---|---|---|
| `stale` | 01 to 08 (primary); also 11, 16, 20, 22, 24 | A real turn says the fact is done (9 facts), answered by the operator (2), replaced (1), wrong (1) or changed (1 update) |
| `lookalike` | 09 to 16 (primary); also 03, 04, 05, 08, 19 | A statement that resembles a settlement: the same tests on another platform, a sibling key, staging instead of production, a plan stated after "Done with that part", a question asked again, a reply that does not answer |
| `compaction` | 17 to 24 | A summary turn. It claims a fact done with no real turn behind it (17, 19, 22, 24); it leaves the open facts out (18, the known failure); a real turn contradicts it (20, 21, 22); a real turn confirms one of its claims (20, 22); it is accurate (23) |
| `easy` | 01, 02, 23 | A plain case, so a saturated criterion shows |
| `update` | 05 | A count changed from 14 to 5 |
| `duplicate` | 07 | Two open facts say the same thing |

Summary turns have two forms: a user turn that opens the tail (seven items) and an agent turn in the middle of the tail (22). In 24 the summary is longer than 1,000 characters, so the plugin clips its middle; both planted claims lie in the kept parts.

### 2.4 Sizes

Modelled on the store, read for counts only: open facts per task have a median of 6, 11 at the 75th percentile and 42 at the 90th; fact texts average about 80 characters; about half of the open facts are in the `done` section.

| Size | Items | Open facts | Built tail, characters |
|---|---|---|---|
| small | 7 | 3 to 4 | 325 to 861 |
| medium | 12 | 8 to 9 | 1,478 to 4,123 |
| large | 5 | 26 to 28 | 8,681 to 12,093 |

In 06, 08 and 14 the turns exceed the budget, so the plugin omits the oldest (4, 2 and 1 turns). In 08 the settling agent turn is longer than 1,200 characters and is clipped; the settling sentence is in the kept end.

The real size of a reconcile tail is not known: the store keeps writer documents only.

### 2.5 What `check-dataset.ts` proves

Run: `bun evals/curator-reconcile/check-dataset.ts`. It exits 1 on any problem. For every item:

- The line parses, the id is unique, the plants and the size are known, hosts end in `.test`, there is no home path.
- `reconcileInput` accepts the input and returns a reconcile document with the still-true rubric and the ids `f1` to `fN`.
- The four expected lists cover every open fact exactly once.
- Every `evidence` and every `lookalikes` span is quoted in a real turn of the built tail (by `quotedIn`), and each `evidence` is at most 240 characters.
- Every `summary_spans` text is in the built tail letter for letter. Every `summary_claims` span is in a summary and in no real turn.
- The expected answer, sent as an answer, is kept whole: no parser refusal, no gate refusal.
- A close that quotes a `summary_claims` span is also kept whole. So the plugin does not stop this failure by itself, and R4 and R5 have something to find.

## 3 Criteria

Unit: one answer for one item. An answer passes a criterion or fails it. A transport failure is missing, not a fail. Where a criterion does not apply to an item, its mark is empty and outside n.

### 3.1 Code

| # | Criterion | Check | Breach | Kind | Applies to |
|---|---|---|---|---|---|
| R1 | The answer is JSON with `ops` | `unfenced(text)` parses as a JSON object whose `ops` is an array | Not JSON, or no `ops` array. Then every criterion fails and the judge is not called | regression | 24 items |
| R2 | No operation refused by the parser | `reconciliationOf(...).refused` is empty | Any refusal. The report counts refusals by reason: evidence not in the tail, an `add`, an id that is not open, a bad reason, `answered` on a fact that is not `needs`, a bad merge | regression | 24 items |
| R3 | No operation refused by the ledger gates | No finding of `judge(LEDGER_GATES, ...)` has outcome `refuse` | Any refusal, counted by gate. Flags are counted and do not fail | regression | 24 items |
| R4 | No evidence taken from a summary | For each kept close or update with evidence: `quotedIn(evidence, span)` for some `summary_spans` text, and not `quotedIn(evidence, real)`, where `real` is `built.tail` with every `summary_spans` text removed | Any such operation | regression (known failure) | 8 items |
| R5 | **No still-true fact closed** | A kept close whose id is in `must_stay_open`; or a kept close of a `duplicates` member that is not `merged` into its twin; or a kept `merged` close of an id outside `duplicates` | Any such close. Reported alone, per item and per close | regression | 24 items |
| R6 | Stale facts are closed | Every `must_close` id has a kept close that is not `merged`, or a kept update | Any `must_close` id left untouched | capability | 12 items |
| R7 | A changed fact is updated, not closed | Every `must_update` id has a kept update | No operation on it, or a close | capability | 1 item |
| R8 | A true duplicate is merged | One member of each pair has a kept `merged` close into the other | No such close | capability | 1 item |

Notes on the checks:

- R1 is stricter than the plugin. The plugin reads JSON without an `ops` array as an empty answer.
- R4 and R5 are separate on purpose. In 20 and 22 one summary claim is true and a real turn confirms it: closing that fact while quoting the summary breaks R4 and satisfies R6. Closing a fact that only the summary calls done breaks R5, and R4 too when the quote is from the summary.
- A close of a `must_update` id fails R7 only. It is not counted under R5.
- An update of a `must_stay_open` fact breaks no code criterion. RJ1 judges it.
- The report also gives, per configuration, the mean number of kept operations per answer and the share of answers with none. On the 11 `no-op-expected` items the right answer has none.

### 3.2 Judge

One call per parsed answer, one criterion. Judge: `claude-sonnet-5-5` through the Claude Agent SDK, blind to the configuration, burden of proof on passing.

| # | Rule given to the judge | Breach | Kind |
|---|---|---|---|
| RJ1 | "Every operation is shown by its own quote. For a close: the quoted words, read in their turn, state that the fact is finished, wrong, replaced, or answered by the operator, as the operation's reason claims. For an update: the quoted words state what the new text says. A plan, a question, a partial result, or a statement about another thing does not show it. Pass only if this holds for every operation; quote the operation that fails otherwise. If the answer has no operation, pass and quote `No operation was kept.`" | "An operation whose quote does not state what the operation claims." | regression |

The judge's view, built by the eval and free of any configuration, model or repetition:

- `case`: the facts that a kept operation touches, each as `fN [section] text`, then the built tail (`built.tail`).
- `answer`: one line per kept operation with its id, kind, reason or new text, and evidence; or the line `No operation was kept.`

`merged` closes carry no evidence and are left out of the view; R5 and R8 grade them.

RJ1 is printed "judge, not validated" until the judge-agreement eval validates it. On the two `claude-sonnet-5-5` rungs the judge grades its own model; the report flags it.

The judge is not told which turns are summaries. A quote from a summary can pass RJ1 and fail R4.

## 4 Configurations

From `evals/lib/ladder.ts`, whose rungs `v2/sdk-facts.md` verified (model and effort accepted by the login).

| Name | Backend | Model | Effort | |
|---|---|---|---|---|
| `codex-luna-medium` | codex | `gpt-6-luna` | medium | **shipped** |
| `claude-haiku-medium` | claude | `claude-haiku-5-5` | medium | |
| `claude-sonnet-medium` | claude | `claude-sonnet-5-5` | medium | |
| `claude-sonnet-high` | claude | `claude-sonnet-5-5` | high | |
| `codex-luna-low` | codex | `gpt-6-luna` | low | |
| `codex-sol-medium` | codex | `gpt-6.1-sol` | medium | |

Shipped: `CURATE_DEFAULT` in `tab-recap/src/recap/domain/job.ts` is `{ by: 'recap', model: '', effort: 'medium' }`, so the curator runs on the recap job's backend at medium effort. The inventory counts 2545 stored recap runs on `codex/gpt-6-luna`. The store does not record which model reconciled a ledger, and the owner's live configuration was not read. This is the most likely shipped configuration, not a verified one.

If the run does not fit the time, drop `claude-sonnet-high`, then `codex-luna-low`. Never drop an item.

## 5 Repetitions and size

- 3 repetitions per item and configuration.
- 24 items x 6 configurations x 3 repetitions = 432 job calls.
- At most 432 judge calls (one per parsed answer).
- An item passes a criterion for a configuration when all its repetitions pass. Items that flip are listed.
- Counted and reported per configuration: calls, tokens, seconds, and cost where the SDK reports it.

## 6 What the run can and cannot show

Can show:
- Which configurations break the contract (R1), are refused by the parser or a gate (R2, R3), quote a summary (R4), or close a planted still-true fact (R5).
- Whether the known compaction failure recurs on the 8 summary items, per configuration.
- Which planted stale facts each configuration misses (R6), and which items flip between repetitions.
- A difference between two configurations of about 25 points or more on 24 paired items.
- Calls, tokens, seconds and cost per configuration.

Cannot show:
- How often a wrong close happens in real use. The cases are chosen, not sampled.
- A pass against a bar. 24 items give intervals of 30 to 40 points; R4 has 8 items, R6 has 12.
- Anything about updates or merges beyond one item each (R7, R8).
- That the expected answers are right. A model wrote them and nobody audited them. An item that every configuration fails is first a suspect item.
- That mocked tails behave like real ones. Real summary turns are longer, and the real size of a reconcile tail is not known.
- That a real summary turn can be recognised. `Entry` has no flag for it; here the dataset marks them.
- What RJ1 says on answers with no operation. Such an answer passes without telling anything; read RJ1 next to the share of answers with no operation.
- An independent grade of the `claude-sonnet-5-5` rungs on RJ1.
- A best configuration beyond this set. Once a configuration is chosen on it, it is a development set.
