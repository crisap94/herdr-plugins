# Design

## Context

A compaction today starts only from the operator: `tab-recap.compact` or `c` queues a `compact` request; the
daemon checks the agent is idle or done, refreshes the recap (awaited, 90 s at most), writes a brief with the
brief job, and types `/compact` with it (Claude) or the agent's own command followed by a restore message
(Codex, opencode). Each step is a stage of a `compaction` record. The lane header shows `compact? 45% of 1M`
from `TAB_RECAP_COMPACT_HINT`, and that hint is advisory.

What the plugin knows per lane, measured on the live store of 28 lanes on 2026-10-08:

| Signal | Source | State |
|---|---|---|
| Context share | `lane.context_tokens/window`, read on every status change | 28/28 lanes; stale after an agent's own compaction (gap 1) |
| Agent free | herdr's `pane.agent_status_changed` push | yes |
| Work in flight inside a free agent | not read | gap 2 |
| Goal, open work, questions for the operator | ledger (`goal`, `now`, `next`, `needs`) | 15/28 lanes; the rest never had a run (gap 3) |
| Last turns verbatim | `LaneRecent` (12 000 characters) | yes |
| Operator away | entry times, Claude's away notes | yes |
| Uncommitted or unpushed work | git note | yes (a hint) |
| Earlier compactions and their outcome | `boundary`, `compaction` | yes; trigger mislabelled (gap 4) |
| The brief keeps what matters | ledger facts vs brief | not checked today |

## Decisions

### 1. Code gates first; the decider only judges what code cannot

On a lane's `idle` or `done` push, after the dispatcher's lane refresh, `Autocompact.consider(lane)` runs
these pure gates in `domain/autocompact.ts`, in this order:

1. The kind is in `TAB_RECAP_AUTOCOMPACT_KINDS` (default `claude`). Any other compactable kind is still
   decided and recorded, but marked `record-only`.
2. No compaction of the lane is in progress, and no automatic request for it is younger than five minutes without
   a compaction record (the recap refresh before a compaction can take 90 s).
3. Nothing is in flight (decision 8). A reader that cannot tell counts as in flight.
4. The share is at least the soft limit (`TAB_RECAP_AUTOCOMPACT_AT`, 40; 10–95).
5. The cooldown has passed (`TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS`, 10 min). It counts since the lane's last
   boundary and since its last recorded decision of any verdict, so shadow mode does not re-ask on every idle.
6. A share at or above the ceiling (`TAB_RECAP_AUTOCOMPACT_CEILING`, 80; above the soft limit) gives the
   verdict `compact`, `gate: ceiling`, with no model call. The plugin's brief then always beats the agent's
   own late compaction.

A lane with no recap run gets one first (`refreshNow`, awaited as compaction already does). A question
whose precondition is absent has no answer.

Every consideration that passes gate 4 is recorded. Gates 1–3 and 5 are logged at debug level only, so the
store does not fill with every idle.

Why: the cheap facts are exact in code. A model is asked only what needs reading: whether the work is at a
boundary, which is the semantic trigger the literature recommends. Keeping exact things in code also keeps
the questions few and answerable.

### 2. Typed yes/no questions, one judgment each, naming the fields they read

The decider receives one JSON state with named fields:
- `last_prompt`;
- `last_reply` (the first 600 and the last 1 200 characters);
- `recent_turns` (the last 6 entries, tool calls as kind and command);
- `goal`;
- `open_work` (open `now`, `next` and `needs` facts, at most 12).

The share, window and times go to code, not to the decider. A field no question names is noise, not context.

| id | Question | `compact` needs |
|---|---|---|
| `closes_request` | Does `last_reply` deliver what `last_prompt` asked for (done, answered, merged, reported), rather than an intermediate step? | ≥ 0.70, or `changes_subject` ≥ 0.70 |
| `announces_continuation` | Does `last_reply` say the agent is in the middle of something or will carry on by itself (a next command, a job it waits for)? | ≤ 0.30 |
| `asks_detailed_choice` | Does `last_reply` end by asking the operator to choose between options whose details exist only in `last_reply`? | ≤ 0.30 |
| `needs_verbatim` | Would continuing toward `goal` with the items in `open_work` need exact material found only in `recent_turns` (error output, a diff, command output, figures)? | ≤ 0.30 |
| `changes_subject` | Does `last_prompt` start work unrelated to `goal`? | alternative to `closes_request` |
| `stuck` | Does `recent_turns` show the same step failing more than once without progress? | ≤ 0.30 |

Each question carries `true` and `false` criteria. Any answer between 0.35 and 0.65 is **undecided**, and an
undecided answer that the verdict depends on gives `wait`.

Thresholds are named constants. A question that lands in the undecided band on most corpus cases is
retired, not reworded until it passes. Each question ships a fixture where the answer must be high and one
where it must be low.

Why these rules: questions that quantify over a set, ask two things at once, or embed routing return
midpoint answers that no rewording fixes. Naming the fields a question judges makes answers more decisive;
unnamed state makes them less.

### 3. Above the soft limit, every safe moment compacts

There is no preference score and no "maybe later". `compact` holds when:
- `announces_continuation`, `asks_detailed_choice`, `needs_verbatim` and `stuck` are all ≤ 0.30; and
- `closes_request` ≥ 0.70 or `changes_subject` ≥ 0.70.

Otherwise the verdict is `wait`, and the lane is asked again on its next idle after the cooldown. This is the
operator's rule: the more it compacts the better, as long as nothing the current goal needs is lost.
Decision 4 guards the second half.

### 4. Brief coverage: code enumerates the facts, one question per fact

After the brief job writes the brief and before anything is typed:
- code lists the open `goal`, `now`, `needs`, `decisions`, `next` and `rules` facts of the tasks that hold the
  lane, newest first, at most 40;
- the decider answers `brief_keeps_fact` for each: does `brief` carry `fact.text` with the detail needed to
  act on it (names, paths and numbers kept)?
- each decision also gets `brief_keeps_reason`: does `brief` give the reason in `fact.why` for `fact.text`?

The outcome depends on what is missing:
- **A `goal`, `needs`, `decisions` or `rules` fact missing** (< 0.70): the brief is rewritten once, with a
  correction naming the missing facts.
- **Still missing after the rewrite:** an autocompact gets `wait` (`gate: coverage`) and nothing is typed.
- **The brief cannot be checked** (no decider, the decider fails, or only the template exists): an autocompact
  waits too. The check fails closed.
- **An operator's compaction** is not checked in this release; its flow stays as it is.
- **Only `now` or `next` facts missing:** recorded, and the compaction goes ahead.

Why: one question per fact is the only way to get a per-fact answer. A question over the whole list returns
the average, which says nothing about which fact is missing.

### 5. A decider port with two adapters; the default chosen by measurement

`ports/decider.ts`:
- `Decider { label; ask(state: object, questions: Record<id, Noul>): Promise<Decided | Unknown> }`;
- `Noul { instructions; criteria: { true; false } }`;
- `Decided { answers: Record<id, number>; tokens; costUsd; tookMs; model }`.

The two adapters:
- **`jev-decider.ts`**: `POST TAB_RECAP_JEV_URL` (default `https://api.typesafe.ai/v1/systemone`) with
  `{model, state, questions}`, where `model` is `TAB_RECAP_JEV_MODEL` (default `jev-1.13.0`, pinned).
  - Auth is `Authorization: Bearer <key>`, and the timeout is `AbortSignal.timeout(10 s)`.
  - Errors map to the existing `Unknown` kinds: an HTTP refusal → `failed` with its code (401/403 said as
    refused, 429/529 as busy), a timeout → `timeout`, a network error → `unreachable`, a non-JSON body or a
    missing `noul` → `unreadable`.
  - The URL must be `https://`, or `http://` to a loopback address, so the bearer key never travels in clear text.
  - With `jev`, the state document (the last prompt and reply, recent turns, goal and open work) and, for
    coverage, the brief and the facts go to that service. The documentation says so.
  - Cost is `usage.input_tokens × 0.042 / 10⁶` (output is free).
  - The URL may be any compatible pass-through; the model id is opaque.
- **`harness-decider.ts`**: one `Harness.run` call. The instructions list the questions and ask for one JSON
  object `{id: probability}`; the parser accepts only numbers in [0, 1] for every id, and anything else is
  `unreadable`. Cost and time come from the harness.

`TAB_RECAP_AUTOCOMPACT_BY` takes the same choices as the other jobs, plus `jev`: `recap`, `auto`, a harness
name, `jev` or `off`. The model and effort come from `TAB_RECAP_AUTOCOMPACT_MODEL` and `_EFFORT`, with
effort `low` by default.

**The key.** `jev-key.ts` reads, at call time:
1. `TAB_RECAP_JEV_KEY` (the environment, then `config.env`);
2. `TYPESAFE_API_KEY`;
3. the file `~/.config/typesafe-api-key`.

The key is never logged, stored, shown in the settings modal or included in an `Unknown`'s detail; a test
asserts this over every adapter path. The settings modal never writes it.

**Measured** on one state with three questions (2026-10-08):

| | Jev `jev-1.13.0` | Haiku 5.5, low effort, via `claude -p` on a subscription |
|---|---|---|
| Tokens | 732 in | 1 172 in (cached after the first call), 49 out |
| Money | $0.00003 | none billed; ≈ $0.00004 of plan usage |
| Wall time | 0.55 s | 2.2 s |
| Answers | 0.95 · 0.14 · 0.04 | 0.92 · 0.10 · 0.03 (steady over three runs) |

Both cost a negligible amount: a busy day of decisions and brief checks is about one and a half cents. So
the choice is about quality and friction:
- **Jev** answers each question independently with calibrated probabilities, and needs a key and one more
  data processor.
- **A harness** needs nothing new, but gives coarse, verbalised probabilities.

**EXP-002 result.** The rule of decision 9 picks `recap` (the recap writer's harness at low effort, `haiku-low`) as the
moment decider: its policy precision is within 3 points of the best (0.981) and its drift is 0.039. The brief check
uses Jev, whose mean `brief_keeps_*` AUC is 0.912 against 0.693 for `haiku-low`. `TAB_RECAP_AUTOCOMPACT_COVERAGE_BY`
chooses that check's decider: `auto` (the default: Jev when a key is found by the key chain, else the moment
decider), `jev`, or `decider`. Two limits travel with the result: the labels come from one model, and `needs_verbatim`
has no labelled positive, so its AUC is not measured; the operator's labels are still pending.

Why hand-written: no Node built-in speaks this API. The global `fetch` and `AbortSignal.timeout` are the
built-ins used, and no package is added.

### 6. Shadow by default

`TAB_RECAP_AUTOCOMPACT=off|shadow|on`, `shadow` by default. Shadow records every decision and logs one line:

```
autocompact w1:p2: 61 % · closes 0.91 · continues 0.08 · choice 0.02 · verbatim 0.12 · subject 0.03 · stuck 0.01 → compact (shadow)
```

It never requests a compaction. On does the same and then requests one.

### 7. Typing stays behind the request path

`on` calls `requests.requestCompact({tab, pane, note: null, origin: 'auto'})`, the same path the popup uses.
The compaction service is unchanged except that it carries `origin` into the record and the toast. Only
`adapters/herdr-agents.ts` types into an agent, so the `recap-prompt-boundary` rule holds without an
exception.

### 8. Information fixes

- **The context share follows an agent's own compaction.**
  - Claude: a row with `compactMetadata.postTokens` replaces the latest usage, until a newer assistant usage
    row arrives.
  - Codex: the `compacted` mark's following `token_count` already does this; a test pins it.
  - opencode: the compaction answer's tokens are used the same way.
- **In flight.** `Transcripts.inFlight?(source): Promise<InFlight>`. For Claude it scans the tail for tool uses
  with `run_in_background: true`, `Agent`/`Task` launches and `Monitor` starts that have no matching
  `<task-notification>` (completed, failed, killed or stopped) after them. Other readers answer `unknown`,
  which gate 3 treats as in flight. That is why only Claude is in the default kinds.
- **Trigger.** A boundary's trigger is:
  - `plugin` when the plugin started a compaction of the lane in the previous ten minutes;
  - otherwise the agent's own word (`manual` or `auto`; Claude `compactMetadata.trigger`);
  - otherwise `auto`.

  Migration 010 rebuilds `boundary` with the new CHECK and rewrites stored `manual` rows to `plugin` (every
  stored `manual` was plugin-driven by the old rule).
- **Run duration.** The daemon logs `recap <tab>: written in 12.4 s (turn-ended)`.

### 9. EXP-002: the corpus and the experiment, pre-registered

- **Sampling frame:** every stored `turn-ended` run. Each is a real idle with the exact ledger at that moment,
  and the transcript after `run.at` holds what happened next. Sample 240 points, stratified:
  - 120 with a share ≥ 40 %;
  - 60 among the turn ends before the agents' own compactions;
  - 60 at random.
- **Labels, from hindsight:**
  - a pinned strong labeller reads the state plus the operator's next prompt and the agent's next turns, and
    answers each question;
  - `needs_verbatim` is cross-checked deterministically: does the next agent turn reuse paths, error lines or
    hashes found only in `recent_turns`?
  - the operator labels 60 points; a question's labels are used only where kappa against the operator is
    ≥ 0.6.
- **Brief corpus:** briefs are regenerated for 30 points, giving about 750 fact/brief pairs, labelled the same
  way.
- **Outcome check:** for every compaction boundary in the transcripts, count what followed: files re-read
  within ten tool calls that were read in the fifty before, and the operator restating something. Compare
  the boundaries the policy would have allowed with those it would have blocked.
- **Arms:** Jev; Haiku 5.5 at low and at medium effort via the Claude harness; gpt-6-luna at low effort via
  the Codex harness. Each arm runs twice.
- **Metrics:**
  - per question: AUC, Brier score, undecided rate, drift between runs, tokens, money, wall time;
  - per policy: precision of `compact` (compacting at an unsafe moment is the costly error), recall above the
    soft limit, and the outcome gap.
- **Rule:**
  - the default decider is the arm needing nothing beyond the recap writer's harness whose policy precision
    is within 3 points of the best and whose drift is ≤ 0.15;
  - another arm becomes the default only if it beats that;
  - brief coverage uses the arm with the best `brief_keeps_*` AUC.
- **Layout:** `experiments/EXP-002-autocompact/`, following EXP-001. Raw corpus items quote real sessions and
  stay out of the public branch; only numbers and the probe are public.

### 10. Records

Migration 010 adds `autocompact_decision`:

| Column | Holds |
|---|---|
| `id`, `tab_id`, `pane`, `agent`, `at` | which lane and when |
| `mode` | `shadow` or `on` |
| `share`, `tokens`, `window` | how full the context was |
| `gate` | `ask`, `ceiling` or `coverage` |
| `verdict` | `compact`, `wait`, `undecided` or `unknown` |
| `answers` | JSON, id → probability |
| `coverage` | JSON, fact key → probability, or null |
| `decider`, `cost_micro_usd`, `took_ms` | who decided, at what cost and how fast |
| `compaction_id` | null until a compaction follows |

The same migration adds `compaction.origin` (`operator` | `auto`, default `operator`), and the `boundary`
rebuild of decision 8.

`tab-recap autocompact [--all]` lists the newest 20 decisions read-only, and never touches columns. The
expanded view's session facts gain one line: `autocompact: 12 decisions · 3 compacted · 9 waited`.

## Risks

- **A wrong `compact` loses context the next step needs.** The mitigations are shadow first, the
  `needs_verbatim` and `asks_detailed_choice` questions, brief coverage, and the outcome check in EXP-002.
- **A decider outage silently stops autocompact.** One log line per outage, and the ceiling still compacts.
- **Cost drift.** Every decision stores its cost, and the listing sums the last 24 h.
- **The key leaks.** It is read only in `jev-key.ts`; a test feeds a sentinel key through every path and greps
  every log line and error for it.
