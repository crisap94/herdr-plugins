# Design

## Context

2.0's extract job: one harness call with the version 2 document (open ledger + new turns) → `{"ops":[…]}` →
gates → one correction retry (the whole document again) → drop → apply. The judge (`judge.ts`) scores a run's
items, where `RunInputs.itemsOf(run)` returns the facts whose `born_run` is that run; coverage, no-filler and
the read-back are computed over those. The curator job runs on an open of the expanded view and may only
close-as-merged and write the story. Measured on 2026-10-07 (see the proposal): 3.5 facts per turn, coverage
33 %, read-back 0–47 %, one fact from a 300-row turn.

## Decisions

### 1. The ruler: judge the ledger state, not the run's additions

`RunInputs.itemsOf(run)` gains a mode. **State** (the default for coverage, no-filler and the read-back): the
task's facts that were open right after the run (`born_run <= run` and `(closed_at IS NULL OR closed_at > run.at)`,
by `last_at`), keyed `<task>/<section>/<n>`. **Added** (the item checks I1–I7 and the section checks, as today):
the facts born in the run — a check per fact is scored once, when the fact is born. The report shows coverage
and read-back as state numbers and keeps the added numbers in a second column. `verdict.item_key` for state
rows is prefixed `state/`. Why hand-written: one SQL predicate; no built-in.

### 2. Anchors: every added fact quotes its source

The writer's `add` gains `"anchor": "…"`: at most 120 characters copied from the input (a turn, a tool call,
an agent note). Gate **G11 anchor**: refused when the anchor is empty or is not found in the run's input after
whitespace folding (`Intl.Segmenter` words, case kept). Stored as `fact.anchor` (migration 009, nullable; 1.x
imports have none). The judge's I4 keeps running as a cross-check; a fact with a verified anchor that the
judge calls unsupported is listed under "judge vs anchor" in the report (either the judge or the rubric is
wrong there — calibration material). `update` may carry an anchor too; `close` never.

### 3. Enumerate, then reconcile (the pipeline)

```
turn ends
 A enumerate   per chunk of the new turns (≤ 6 000 chars of markup each, split at turn boundaries, else at tool bursts):
               one call at LOW effort: "for each section, list every candidate fact in this chunk with its anchor, or `none`"
               + mandatory candidates from triggers (decision 4) → Candidate[] {section, text, why?, ref?, anchor, at}
 B ask-back    only when the turn is large (> 1 chunk) or thin (A gave < 1 candidate per 2 000 chars): the six read-back
               questions + "what changed about open fact fN?" for the facts the turn mentions → the questions the candidates
               cannot answer → ONE more enumerate call restricted to those questions. Never a third.
 C reconcile   one call at the writer's effort: candidates (deduplicated by Jaccard ≥ 0.6 among themselves) + the open ledger
               → operations {add|update|close} — the candidates are the only source of adds; the ledger the only source of ids
 D gates       decision 5
 E apply       as today (+ the stale-now sweep)
```
`enumerate_input` (`schema/enumerate-input.dtd`): the chunk's turns and tool calls, the section skeleton with one
line of definition each, the triggers found, the questions (ask-back only). Answer: `{"candidates":[…]}`.
`reconcile` uses the version 2 `recap_input` with a new `<candidates>` element in place of the raw transcript
(the transcript stays, clipped, for context). Cost: A at low effort is ~¼ of a C call per chunk; a typical turn
costs ~1.5× today's single call, a 300-row turn ~3×. Why a pipeline and not one bigger prompt: the enumeration
research (skeleton + repeated local passes) and Mem0's extract/update split both show the model does better at
one job per call; our own low-vs-medium replay showed the single call drops decisions under load.

### 4. Triggers: mandatory candidates

From the readers' structured tool calls and the turns, with no model: a `shell` call whose command starts with
`git commit|merge|push|tag`, `gh pr|release`, `glab mr`; an `edit` call (path); a tool result or turn containing
`Error`, `FAIL`, `✖`, `Traceback`; a user turn ending in `?` or starting with "should|do you|can we|which"
(en/es). Each becomes a candidate stub (`{section hint, ref, anchor}`) the enumerate call must either fill in
or mark `skip` with a reason; a stub it ignores is kept as a flagged candidate. Why: event-triggered extraction
beats blanket summarization on recall (Proactive Memory Extraction); these are the events a coding session is
made of.

### 5. Gates recall-first, retry targeted

| gate | now | 2.1 |
| --- | --- | --- |
| G1 narrator, G3 decision without why, G6 unknown id, G2 duplicate, G10 close without why | refuse | refuse |
| G11 anchor missing / not in input | — | refuse |
| G12 `answered` on a fact that is not `needs` | — | refuse (the correction says which reasons fit) |
| G4 link does not resolve | refuse | **flag** (drawn without a hyperlink) |
| G8 not specific, G9 pronoun opener | flag | flag |

The correction retry sends a **short document**: the refused operations with their reasons and anchors, the
open facts they refer to, and nothing else (`correction_input`, `schema/correction-input.dtd`); the writer
answers replacement operations for those only. `dropped` is counted as today. Cost of a retry: ~5 % of a run.

### 6. Ledger reconciliation (the curator, grounded)

The curator job gains a **reconcile** mode: input = the open ledger + the transcript tail (last 12 000 chars)
+ the rubric's I7; answer = operations limited to `update`, `close` (any reason but `rewritten`) and the
existing merges; adds are refused. Triggers: every `TAB_RECAP_RECONCILE_EVERY` turns (default 8), an open of
the expanded view (as today, with the story), and the first run after a boundary (where the mis-closes were
seen). Throttle as today (5 min per task). Why: retrospective reflection (RMM) is what closes what the
per-turn writer never looks at.

### 7. Calibration anchors and kappa

`eval --label` stores the operator's reason with each verdict (it does); `judge-instructions.ts` injects, per
check, up to 5 operator corrections where the judge disagreed (the item, the operator's verdict and reason) as
anchors, newest first — "when in doubt, the operator decided like this". `eval --agree` prints Cohen's kappa
per check beside the raw agreement, flags checks under 0.6, and lists the three most-disagreed items per check.
`eval --label` gains `--check I5` to label one check only (the fastest way to fix a weak one).

### 8. The fair 1.x comparison and the pipeline switch

`eval --replay --compare-imported <tab>`: per chapter of the tab, the last good 1.x recap (from `item`, still
present) is judged as one state against the replay's ledger state at the same cursor, same key facts, same
read-back questions; printed side by side per chapter and summed. `eval --replay --pipeline one|enumerate|
enumerate+gates|full` runs the extractor as 2.0 (one call), with A only, with A + decision 5, or with A–F.
Every report names the pipeline, the writer job and the judge job, so numbers are comparable.

### 9. Acceptance, measured before merge

On the 40-prompt replay with the state ruler and the same judge: coverage ≥ 70 % (from a 33 % floor, to be
re-measured first with the new ruler on the 2.0 pipeline), read-back ≥ 4/6 median, supported (anchor-verified)
≥ 98 %, duplicates 0, cost per turn ≤ 2.5× the 2.0 single call. Each pipeline step must move at least one of
these or it is dropped before merge. Kappa ≥ 0.6 on I5 and I7 after the operator's 50 labels and the anchors.

### 10. What stays hand-written and why

Chunking, trigger detection, anchor matching, Jaccard dedup, kappa: each a few lines of pure code with no Node
built-in beyond `Intl.Segmenter`; XML by the existing serializer; no runtime dependency.

## Risks

- Cost: a long turn now costs several calls. The enumerate call runs at low effort and the retry shrinks ~20×;
  net per session is measured in the experiment, not assumed.
- Over-generation: candidates are not facts. The reconcile call and the duplicate gate keep the ledger from
  bloating; the curator merges leftovers; the no-filler number watches it.
- Anchors that paraphrase: G11 needs the quote verbatim; the enumerate instructions say "copy, never paraphrase".
