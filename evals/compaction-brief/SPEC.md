# Eval spec: compaction brief

The expected answers were written by a model and audited by nobody yet. Every report of this eval must say so.

## The job

The plugin writes the instructions an agent reads before it compacts its conversation. A fact the brief loses is gone for the rest of the session: the agent redoes work, reopens a decision or forgets a question.

Only the transport changes. Everything else is the plugin's own code, imported unchanged:

| Piece | Source |
|---|---|
| Instructions (system) | `BRIEF_INSTRUCTIONS`, `tab-recap/src/adapters/job/prompts/brief-instructions.ts` |
| Document (user) | `compactionInput(item.input)`, `tab-recap/src/recap/application/compaction-input.ts` |
| Parser | `unfenced(text)`, `tab-recap/src/adapters/job/prompts/recap-prompt.ts` (what `HarnessBrief.write` applies) |
| Gate | `vetted(unfenced(text), own)`, `tab-recap/src/recap/application/compaction-brief.ts` |
| The session's own text (`own`) | `ownOf(item.input)` in `checks.ts`. It repeats one expression of the private method `Briefing.briefOf` (`compaction-briefing.ts`): the text of every recent entry, then the text and reason of every history fact, joined by a line break |
| Facts a brief must keep | `factsOf(history)`, `tab-recap/src/recap/application/brief-coverage.ts`: the first 40 open facts of the covered sections, of which `goal`, `needs`, `decisions` and `rules` block |

No correction pass is run: the eval measures the first draft, which is what an operator compaction sends.

## The dataset

`dataset.jsonl`: 24 items, one JSON object per line. All content is invented (8 fictional projects, hosts under `.test`). Shapes follow the real store, read as counts and lengths only: history of 28 to 300 facts (real: 26 to 300 after the plugin's limit), 6 to 31 blocking open facts (real: 2 to 38 for most lanes), fact texts of about 75 characters, every decision with a reason, a recent tail cut at 12,000 characters on the large items.

Built by `bun dataset-source/build.ts` (same bytes on every run) and checked by `bun check.ts`.

Each line:

| Field | Content |
|---|---|
| `id` | `cb-01` to `cb-24` |
| `plants` | the planted cases of the item (table below) |
| `tags` | `size:`, `project:`, `language:`, `facts:`, `note:`, `break:` |
| `input` | a `CompactionMaterial`, exactly what `compactionInput` takes |
| `expected` | the answer by construction (below) |

`expected`:

| Field | Meaning |
|---|---|
| `language` | always `en`: the instructions ask for English |
| `session_language` | `en`, `es` or `pt` |
| `note` | the operator's note, or null |
| `goal` | the one open goal: `index` into `input.history`, `text` |
| `must_keep` | the blocking facts of the plugin's own window, each with `index`, `section`, `text` |
| `reasons` | the decisions of `must_keep`, each with its `why` |
| `waiting_on_operator` | the `must_keep` needs that wait for the operator's answer |
| `settled` | every fact the document marks `settled="yes"` |
| `must_not_reopen` | the planted settled facts that read like open work |
| `planted.reasons` | the planted decision: old, absent from `current_recap` and from the turns |
| `planted.bait` | a thing the session names without a path, and paths a model might invent for it |
| `planted.forbidden_not_in_own` | words the document shows outside the session's own text: the gate refuses them |
| `planted.forbidden_in_own` | forbidden words that are the session's own subject: the gate allows them |
| `planted.gate_conflict` | true when the operator's note itself holds a refused word |
| `planted.long_ledger` | true when the kept facts and reasons alone pass 2,600 characters |
| `must_keep_characters` | characters of the kept facts and their reasons |
| `allowed_tokens` | every path, URL, merge request reference and commit of the document (`tokensOf` in `checks.ts`) |

Plants (20 planted items carry 24 plants; 4 items carry two):

| Plant | Items | What is planted |
|---|---|---|
| `plain` | cb-01 to cb-04 | nothing: small and medium sessions, one with a note. A criterion that fails here is broken or saturated the wrong way |
| `long-ledger` | cb-05 to cb-08 | 210 to 300 facts, 30 or 31 blocking: the kept facts with their reasons already take 2,634 to 2,839 characters of the 3,000 |
| `reason-easy-to-drop` | cb-07, cb-09 to cb-13 | one decision made at the start of the session, never repeated, absent from `current_recap`; its reason holds a detail |
| `settled-reads-open` | cb-08, cb-14 to cb-17 | a need or next step closed before the last compaction, worded like open work; most sit next to an open fact on the same subject that must be kept |
| `forbidden-name-in-input` | cb-18 to cb-21 | cb-18: `recap`, `plugin`, `tab` in the lane label and call names only. cb-19: `tabs` and `plugin` are the session's own subject (allowed). cb-20: call bursts and call names. cb-21: the operator's note says `tab` |
| `non-english-session` | cb-22 to cb-24 | Spanish (2) and Portuguese (1) sessions; the brief must be English |
| `invented-path-bait` | cb-12, cb-23 | a file the session names without a path, among facts with exact paths |

## Criteria

One mark per answer and criterion: pass, fail or missing. A transport failure is missing for every criterion. An answer that `vetted` refuses fails B1 and gets no judge call; the judge criteria of that answer are missing.

### Code

| Id | Criterion | Check | Breach | Kind |
|---|---|---|---|---|
| B1 | Usable | `vetted(unfenced(text), own).kind === 'ok'` | empty, or a refused word: the plugin falls back to its template | regression |
| B2 | Names no plugin | `refusedIn(squashed, own)` is empty (`compaction-brief.ts`) | `recap`, `plugin`, `herdr`, `tab`, `tab-recap`, `recap column` when the session's own text does not hold it | regression |
| B3 | Names no tool or input | `inputWordsIn(text, own)` is empty (`checks.ts`) | `tool`, `tools`, `compaction_input`, `session_history`, `current_recap`, same exemption. The plugin does not gate this today | regression |
| B4 | Fits the limit | length of the answer after whitespace is squashed, as `vetted` does, is at most 3000 | over 3000: `cut()` drops the tail without telling anyone | regression |
| B5 | Plain text | `isPlain(raw answer)` (`checks.ts`) | a heading, a list marker at a line start, or a code fence | regression |
| B6 | English | `isEnglish(text)` (`checks.ts`): share of English function words at least 0.15 and more than twice the Spanish and Portuguese share | a brief in the session's language | regression |
| B7 | No unknown reference | `unknownTokens(text, expected.allowed_tokens)` is empty | a path, file name, URL, `!n` reference or commit that no token of the document contains | capability |

Reported, not marked: characters of each brief; whether the gate cut it; for bait items, whether an `invented` path was written.

B2 on cb-21 is reported apart. The instructions ask for the note first "in its own words" and the note says `tab`, which the gate refuses: a fail there is first a conflict in the product, and a pass means the model reworded the note.

### Judge

One call per usable answer to `claude-sonnet-5-5`, effort medium, blind to the configuration. It returns pass or fail for each criterion with a quote as evidence. The burden of proof is on passing. Until `judge-agreement` part B has checked a criterion, the report prints it as "judge, not validated".

The judge sees, as `case`: the document, and the lists `goal`, `must_keep` (text), `reasons` (text and why), `waiting_on_operator`, `settled` and `must_not_reopen` of `expected`. As `answer`: the brief after `unfenced`. It never sees `plants`, `tags`, `planted` or the configuration.

| Id | Rule (the exact question) | Breach | Kind |
|---|---|---|---|
| BJ1 | "Does the brief carry what every fact of must_keep says, each with the detail needed to act on it (names, paths and numbers kept)?" | one fact left out, or only gestured at without its names, paths or numbers. The note of evidence names the first missing fact | capability |
| BJ2 | "For every decision in reasons that the brief holds, does the brief give the reason listed for it?" | a decision stated without its reason, or with another reason. A decision the brief does not hold is BJ1's breach, not this one's | capability |
| BJ3 | "Does every decision, rule, path, number and open question in the brief come from the document?" | one that the document does not hold, or one changed in substance (another number, another path, the opposite choice) | capability |
| BJ4 | "Does the brief leave every fact of settled closed: not asked for as open work, not asked again as a question?" | a settled fact presented as unfinished work or as a pending question. Naming it as settled is a pass. With no settled fact the criterion passes | capability |
| BJ5 | "Reading only the brief as the operator's message, can the agent tell the goal, and every question of waiting_on_operator as waiting for the operator?" | the goal absent or replaced by a closed one; a waiting question absent or told as answered; a reference to a thing the brief does not name | capability |

BJ1 is strict: the plugin's own coverage gate also refuses a brief that misses one blocking fact. It cannot give a per-fact rate; `coverage-check` holds that.

## Configurations

From `evals/lib/ladder.ts` (verified in `v2/sdk-facts.md`). Six rungs, three per backend:

| Name | Backend | Model | Effort | |
|---|---|---|---|---|
| `codex-sol-medium` | codex | `gpt-6.1-sol` | medium | **shipped** |
| `claude-haiku-medium` | claude | `claude-haiku-5-5` | medium | |
| `claude-sonnet-medium` | claude | `claude-sonnet-5-5` | medium | graded by its own model |
| `claude-sonnet-high` | claude | `claude-sonnet-5-5` | high | graded by its own model |
| `codex-luna-low` | codex | `gpt-6-luna` | low | |
| `codex-luna-medium` | codex | `gpt-6-luna` | medium | |

Shipped means: what the store shows the job ran on. The `writer` column of the `compaction` table says `codex · gpt-6.1-sol · medium` for 90 of 107 rows and for every row since 2026-10-20. The owner's live setting was not read.

If the run does not fit, drop a rung in the order of `dropOrder` in `config.json`, never an item.

## Repetitions and size

3 repetitions. 24 items x 6 configurations x 3 = 432 job calls and at most 432 judge calls. An item passes a criterion when all 3 repetitions pass; items that flip are listed. Documents run from 6 kB to 58 kB; `sdk-facts.md` did not verify calls of that size, so the first calls of a run measure it.

## What the run can show

- Which configurations break the contract (B1 to B6) on which planted case.
- Whether a configuration keeps the old decision and its reason, leaves settled work closed, and writes no path the document lacks.
- How brief length behaves on the four long ledgers: who stays under 3000 and what they drop to do it (B4 against BJ1).
- A difference of about 25 points or more between two configurations on the same 24 items (exact McNemar).
- Calls, tokens, seconds and reported cost per configuration.

## What it cannot show

- How often any of this happens in real use: the cases were chosen, not sampled.
- A pass against a bar: 24 items give intervals of 30 to 40 points; a plant has 2 to 6 items.
- That the expected answers are right. An item every configuration fails is first a suspect item.
- That mocked sessions behave like real ones. The filler facts and turns come from templates and are more regular than real ones; the closing turn repeats one open fact word for word.
- The corrected draft, the coverage check, or behaviour after compaction.
- An independent grade of the two `claude-sonnet-5-5` rungs.
- Codex lanes: every item says `agent kind="claude"`, as every stored compaction does.
- A best configuration beyond this set. Once one is chosen on it, it is a development set.

## Known limits of the code graders

- B6 counts function words. A brief that quotes many Spanish facts word for word inside English sentences can fail it.
- B7 accepts any token that is part of a document token, so a shortened path passes. It does not check a directory path of only two segments without an extension (such as `lib/payments`), branch names without an extension, plain numbers or dates; BJ3 and the bait items cover those.
- B3 has no counterpart in the plugin: its fails are a finding about the product gate, not a regression of it.
