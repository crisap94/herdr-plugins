# Part B recipe: curator-reconcile (RJ1)

This tells a writer how to make the Part B rows for the eval `curator-reconcile`. It has one judge criterion, RJ1. Write 40 rows: 20 that break RJ1 and 20 clean ones. Every row responds to an item of `evals/curator-reconcile/dataset.jsonl`. All data is mocked.

Every answer in the plan below was run through the eval's own parser and gates on 2026-11-14. All 40 parse, and every operation in them is kept.

## 1 What the judge sees

The judge gets the rule and breach from `evals/curator-reconcile/judge-criteria.ts` and a view from `judgeView(item, text)` in `evals/curator-reconcile/scoring.ts`:

- `case`: `Facts touched by the answer:`, one line `fN [section] text` per fact a kept operation touches, then `Newest turns of the work:` and the built tail.
- `answer`: one line per kept operation, `fN close, reason done, evidence: "..."` or `fN update, new text: "...", evidence: "..."`; or `No operation was kept.`

Only kept operations reach the judge. A merge close has no evidence and is left out of the view. An operation the parser or a gate refuses is left out too. So a breach must sit in an operation that is kept.

## 2 RJ1

**What it asks.** Each close or update must be shown by its own quote: the quoted words, read in their turn, state what the operation claims (finished, wrong, replaced or answered for a close; the new text for an update).

The judge's wording, exactly: "every operation is shown by its own quote. For a close: the quoted words, read in their turn, state that the fact is finished, wrong, replaced, or answered by the operator, as the operation's reason claims. For an update: the quoted words state what the new text says. A plan, a question, a partial result, or a statement about another thing does not show it. Pass only if this holds for every operation; quote the operation that fails otherwise. If the answer has no operation, pass and quote `No operation was kept.`"

### 2.1 Four ways to break it

There is no other judge criterion in this eval, so a breach of RJ1 breaks no other judge criterion. Each way is still kept apart from the others: one breached answer uses one way only.

**Way A. The quote is about another thing.** The quote states that something was settled, but it is a different fact, a sibling (another platform, another key, another log, staging instead of production), or a different task.
Items: `rec-01`, `rec-03`, `rec-07`, `rec-09` (f1, Linux and not Windows), `rec-12` (f3, service key and not admin key), `rec-13` (f5, staging), `rec-14` (f5 audit logs vs access logs; f21 staging).

**Way B. The quote is a plan, a request or a question.** The quote is what someone will do, asks for, or asks about. It does not say that anything happened.
Items: `rec-02` (the agent's question in t0), `rec-07` (the user's request in t5), `rec-10` (f4 "I will write..."), `rec-11` (f3 "Next I will add..."), `rec-15` (f1, the user's question), `rec-17` (t4 "I will look at the two todo cases next").

**Way C. The quote is a partial result or a step.** The quote reports progress or a step on the way, and the operation closes the fact as finished.
Items: `rec-04` (f7, the cause found but rows not removed), `rec-05` (f3, 9 of 14 routes), `rec-16` (f3, tag exists locally but not published), `rec-19` (f6, endpoint done but client not), `rec-21` (f3, the change is in the branch but did not cure the crash).

**Way D. The quote states something other than the reason or the new text.** The quote is real and on topic, but the close reason does not match it (it says finished, the op says `wrong` or `superseded`), or the update's new text says something the quote does not say (another number, a detail that is absent, the opposite).
Items: `rec-01` (f2 as `wrong`), `rec-05` (f3 with a wrong count; f7 with the opposite), `rec-06` (f17 update with a number that is not in the quote), `rec-07` (f8 as `wrong`), `rec-20` (f3 as `superseded`), `rec-22` (f8 as `superseded`), `rec-24` (f14 as `wrong`).

### 2.2 How subtle

10 obvious, 10 subtle. Both kinds must be breaches that a careful human reader calls a breach without doubt.

- Obvious: the quote has nothing to do with the claim, or says the opposite, or is plainly a question or a plan. One operation in the answer.
- Subtle: the quote is close to the claim and shares its words (same tests, same key name, same fact), or the bad operation sits next to a correct one in the same answer, or the difference is one number or one reason word. The turn the quote comes from must still make the breach certain when read whole.

### 2.3 The plan: 20 breached answers

Use these as written. Each was checked: it parses, nothing is refused, every operation is kept. `c(id, why, evidence)` is `{"op":"close","id":id,"why":why,"evidence":evidence}`; `u(id, text, evidence)` is `{"op":"update","id":id,"text":text,"why":null,"evidence":evidence}`.

| Row | Way | Kind | Source | ops |
|---|---|---|---|---|
| jb-RJ1-01 | A | obvious | rec-03-stale-superseded-decision | c(f8, done, "the rate limit counters now live in Postgres") |
| jb-RJ1-02 | A | obvious | rec-01-stale-easy-done | c(f3, done, "The --dry-run flag is added to the prune command") |
| jb-RJ1-03 | A | obvious | rec-09-lookalike-other-platform | c(f1, done, "The path tests pass on Linux now") |
| jb-RJ1-04 | A | subtle | rec-12-lookalike-sibling-key | c(f3, done, "Rotated the signing key of the service tokens") |
| jb-RJ1-05 | A | subtle | rec-14-lookalike-two-in-large | c(f5, answered, "For the access logs of the API, keep 30 days") |
| jb-RJ1-06 | B | obvious | rec-10-lookalike-not-answered | c(f4, done, "I will write the contrast report") |
| jb-RJ1-07 | B | obvious | rec-15-lookalike-asked-not-fixed | c(f1, done, "Is the push certificate renewed yet") |
| jb-RJ1-08 | B | subtle | rec-11-lookalike-plan-not-done | c(f6, done, "Migration 0044 is written, with its down script"), c(f3, done, "Next I will add the index on invoices(customer_id) for the customer page") |
| jb-RJ1-09 | B | subtle | rec-07-stale-with-duplicate | c(f8, done, "Turn on background sync for iOS now, the entitlement came through this morning"), {"op":"close","id":"f5","why":"merged","into":"f3"} |
| jb-RJ1-10 | B | obvious | rec-02-stale-easy-answered | c(f1, answered, "should it start collapsed or open on the settings page") |
| jb-RJ1-11 | C | obvious | rec-05-stale-update-count | c(f3, done, "9 of the 14 routes are on the new auth middleware now") |
| jb-RJ1-12 | C | subtle | rec-19-compaction-claims-answered | c(f6, done, "the token endpoint issues them and its 11 tests pass") |
| jb-RJ1-13 | C | subtle | rec-16-lookalike-tagged-not-published | c(f5, done, "The changelog entry for 0.9.0 is written and committed"), c(f3, done, "the tag v0.9.0 exists locally") |
| jb-RJ1-14 | C | obvious | rec-21-compaction-contradicted | c(f3, done, "The change that moved the token read is in the branch") |
| jb-RJ1-15 | C | subtle | rec-04-stale-wrong-cause | c(f4, wrong, "I was wrong about the nightly job"), c(f7, done, "The duplicate rows come from the loader instead") |
| jb-RJ1-16 | D | obvious | rec-05-stale-update-count | u(f7, "Delete the old session store now that no route reads it", "The old session store is still read by those 5") |
| jb-RJ1-17 | D | subtle | rec-05-stale-update-count | u(f3, "Move the 3 remaining admin routes to the new auth middleware", "The 5 that remain are the admin routes") |
| jb-RJ1-18 | D | obvious | rec-01-stale-easy-done | c(f2, wrong, "The --dry-run flag is added to the prune command") |
| jb-RJ1-19 | D | subtle | rec-22-compaction-agent-summary | c(f8, superseded, "The contract tests for the payment webhooks are added") |
| jb-RJ1-20 | D | subtle | rec-06-stale-two-of-many | c(f7, answered, "Use the new logo on everything generated from now on"), u(f17, "Index on invoices(customer_id, sent_at) is in place; list endpoint p95 is now 40 ms", "The index on invoices(customer_id, sent_at) is in place with migration 0043") |

In jb-RJ1-08, -09, -13, -15 and -20 the first operation is correct and only the other one breaks RJ1. In jb-RJ1-09 the merge is not shown to the judge; it is there so the answer looks like a real one. jb-RJ1-16 raises a gate flag (G8), not a refusal: it stays kept.

If you swap a row for another, keep the counts: 5 per way, 10 obvious and 10 subtle, no source used more than 3 times.

### 2.4 Rules for a breached answer

- The answer must parse and every operation must be kept: R1, R2 and R3 pass. Otherwise the bad operation never reaches the judge.
- The evidence is copied word for word from a real turn of the built tail, at most 240 characters. Case and punctuation are folded by the quote test, but words must match.
- Never quote a summary turn (the `summary_spans` of the item). A summary that says a fact is done does state it, so RJ1 passes; that is R4's job. It would make a row that is not a breach.
- Never put the breach in a merge close. Merges are not shown to the judge.
- `answered` only on a `needs` fact. On any other fact the parser refuses it.
- An update text has at most 16 words. The parser cuts longer text, and the judge then sees a cut text.
- Code criteria R4 to R8 may fail. Closing a still-true fact fails R5; that is expected and changes nothing for RJ1.
- An answer with no operation cannot break RJ1: it passes by the rule.

### 2.5 The `evidence` field of a breached row

One string in this form:

`answer: <the bad operation's id, reason or new text, and quote> | source: <fact id and text>; <turn index and what the turn says around the quote>`

Name the turn by its index in `input.tail` (t0 is the first). Say in a few plain words why the quote does not show the claim.

## 3 Clean answers (20)

A clean answer passes RJ1 and every code criterion that applies (R1 to R8). Rules:

- Every close quotes a real turn that states the claim, with the right reason. Every update's text says only what its quote says.
- Close every `must_close` fact (not as merged), update every `must_update` fact, merge one twin of each `duplicates` pair into the other. Touch nothing else.
- Never quote a summary span. In `rec-20` and `rec-22` the fact is also settled by a real turn: quote that one.
- An empty answer `{"ops":[]}` is clean on a `no-op-expected` item. Use at most 3: it passes RJ1 without testing it.

The plan, all checked (every code criterion that applies passes):

| Row | Source | ops |
|---|---|---|
| clean-01 to clean-13 | rec-01, 02, 03, 04, 05, 06, 07, 08, 11, 16, 20, 22, 24 | the item's expected answer: `stubAnswer(item)` of `scoring.ts` (each `must_close` with its first `why` and its `evidence`, each `must_update` with its `text` and `evidence`, each duplicate pair merged as `f<second>` into `f<first>`) |
| clean-14 | rec-01-stale-easy-done | c(f2, done, "The --dry-run flag is added to the prune command: it prints every file that would be deleted and deletes nothing") |
| clean-15 | rec-03-stale-superseded-decision | c(f4, superseded, "the rate limit counters now live in Postgres, one row per API key and minute, and the Redis client is removed from the limiter") |
| clean-16 | rec-20-compaction-one-confirmed | c(f3, done, "The March backfill of orders finished: 412,880 rows in the source and 412,880 in the warehouse") |
| clean-17 | rec-02-stale-easy-answered | c(f1, answered, "Start it collapsed. People can open it when they need it.") |
| clean-18 | rec-09-lookalike-other-platform | none: `{"ops":[]}` |
| clean-19 | rec-17-compaction-claims-done | none: `{"ops":[]}` |
| clean-20 | rec-23-compaction-accurate-quiet | none: `{"ops":[]}` |

You may wrap one or two clean answers in a ```json fence: the eval strips it with `unfenced` (checked).

## 4 Row shape

One JSON object per line in `evals/judge-agreement/dataset-b.jsonl`, fields from SPEC section 7:

| Field | Value here |
|---|---|
| `id` | `jb-RJ1-01` to `jb-RJ1-20`; `jb-curator-reconcile-clean-01` to `-20` |
| `eval` | `"curator-reconcile"` |
| `source` | the full item id, for example `"rec-05-stale-update-count"` |
| `answer` | the answer text, a JSON string such as `"{\"ops\":[...]}"` |
| `breach` | `"RJ1"`, or `null` for a clean row |
| `expected` | `{"RJ1":"fail"}` for a breach, `{"RJ1":"pass"}` for a clean row. Do not write `open`: if you doubt a row, change it |
| `evidence` | the string of 2.5 for a breach; `null` for a clean row |

Worked example, breach (jb-RJ1-11):

```json
{"id":"jb-RJ1-11","eval":"curator-reconcile","source":"rec-05-stale-update-count","answer":"{\"ops\":[{\"op\":\"close\",\"id\":\"f3\",\"why\":\"done\",\"evidence\":\"9 of the 14 routes are on the new auth middleware now\"}]}","breach":"RJ1","expected":{"RJ1":"fail"},"evidence":"answer: f3 close, reason done, evidence \"9 of the 14 routes are on the new auth middleware now\" | source: f3 [next] Move the 14 remaining routes to the new auth middleware; t7 says 9 of 14 are moved and the 5 admin routes remain, so the quote is a partial result, not a finished fact"}
```

Worked example, clean (clean-05):

```json
{"id":"jb-curator-reconcile-clean-05","eval":"curator-reconcile","source":"rec-05-stale-update-count","answer":"{\"ops\":[{\"op\":\"update\",\"id\":\"f3\",\"text\":\"Move the 5 remaining admin routes to the new auth middleware\",\"why\":null,\"evidence\":\"The 5 that remain are the admin routes\"}]}","breach":null,"expected":{"RJ1":"pass"},"evidence":null}
```

## 5 How to check an answer parses

The parser entry point is `checkedOf(item, text)` in `evals/curator-reconcile/scoring.ts`. It runs `reconciliationOf(unfenced(text), built.facts, built.tail)` and the ledger gates, as the eval does. It returns `null` when the answer is not JSON with an `ops` array. Otherwise it returns `{ kept, parserRefused, gateRefused, gateFlagged }`. Use `grade(item, text)` from the same file for the R1 to R8 marks, and `judgeView(item, text)` to see what the judge will see. Load items with `loadItems(path)` from `evals/curator-reconcile/prompt.ts`.

A row is good when:

- breach: `checkedOf` is not `null`, `parserRefused` and `gateRefused` are empty, and `kept.length` equals the number of operations sent;
- clean: the same, and every non-null mark of `grade` is `true`.

A small check, run from `evals/`, reading one row per line from a file:

```ts
import { readFileSync } from 'node:fs';
import { loadItems } from './curator-reconcile/prompt.ts';
import { checkedOf, grade, judgeView } from './curator-reconcile/scoring.ts';

const items = new Map(loadItems('curator-reconcile/dataset.jsonl').map((item) => [item.id, item]));
for (const line of readFileSync(process.argv[2]!, 'utf8').split('\n').filter((each) => each.trim() !== '')) {
    const row = JSON.parse(line);
    if (row.eval !== 'curator-reconcile') continue;
    const item = items.get(row.source)!;
    const found = checkedOf(item, row.answer);
    console.log(row.id, found === null ? 'NOT PARSED' : `kept ${found.kept.length} parser ${JSON.stringify(found.parserRefused)} gates ${JSON.stringify(found.gateRefused)}`, JSON.stringify(grade(item, row.answer).marks));
    console.log(judgeView(item, row.answer).answer);
}
```

Never call the judge or any model to check a row. The judge runs only in the Part B run itself.
