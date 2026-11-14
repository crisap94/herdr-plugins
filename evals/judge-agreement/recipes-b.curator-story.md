# Part B recipe: curator-story (SJ1, SJ2, SJ3)

This tells a writer how to write the 65 planted answers of Part B for `evals/curator-story`. 60 are breached: 20 per criterion. 5 are clean. All data is mocked. Do not change any file of `evals/curator-story` or `evals/lib`.

## 1 What the judge sees

The judge gets one call per answer. It sees the same things the eval shows it:

- `case`: the curator document of the item without `<rubric>`, then `<notes_sj2>` (the planted closed facts and what the story must not say), then `<notes_sj3>` (the open needs facts and their gist, or the no-wait sentence).
- `answer`: only the `story` string of the answer. The `ops` are not shown.

So every breach lives in the story. The ops only matter for the code criteria.

Read the item before you write. Print its facts with their document ids (`f1` is the first fact of `input.facts`), section, state, closed reason, text and reason. In large items most `done` and `links` facts are filler. You may name filler work, but only in the ledger's own words.

## 2 The three criteria in one sentence each

- **SJ1**: every statement of the story (event, decision, reason, name, number, status) is backed by some fact of the ledger. Saying less is fine.
- **SJ2**: the story never tells as true now, as the plan, or as still pending something that the ledger holds only in a fact closed as wrong, superseded or answered. Telling it as past ("first X, then replaced by Y") is fine.
- **SJ3**: when an open `needs` fact exists, the story says what the operator has to do or decide. It applies only to cs-07, cs-12, cs-21, cs-23 and cs-24.

## 3 Rules for every answer

Every answer, breached or clean, must pass these code criteria. Run the check of section 9 on each one.

- The answer text is one JSON object, no fence: `{"ops":[...],"story":"..."}`.
- `ops` holds exactly the expected merges of the item, and nothing else (table below). Items not in the table get `"ops":[]`.
- The story is one paragraph, at most 120 words, no line break, and it does not start with `- `, `* `, `#` or `1. `.
- The story is in the task language. cs-04, cs-10 and cs-22 are `es`: write the whole story in Spanish. All other items are `en`.
- No token that S11 would flag: every name with a digit, dot, underscore, `@` or camel case, and every number written with digits, must appear in the ledger. Write any count you make up yourself in words, or better, do not make one up.
- Never quote the notes. Never use fact ids in the story.

Expected `ops` (close, why `merged`):

| Item | ops |
|---|---|
| cs-05 | `f6` into `f3` |
| cs-06 | `f16` into `f4` |
| cs-07 | `f22` into `f12` |
| cs-08 | `f40` into `f30`, `f28` into `f4` |
| cs-09 | `f53` into `f30` |
| cs-10 | `f11` into `f2` |
| cs-11 | `f3` into `f5` |
| cs-12 | `f10` into `f11` |
| cs-13 | `f13` into `f17` |
| cs-14 | `f39` into `f22` |

Each op is `{"op":"close","id":"<closed>","why":"merged","into":"<kept>"}`.

A breached answer breaks exactly one judge criterion. Everything else in the story must be as clean as a clean answer:

- On the 5 waiting items (cs-07, cs-12, cs-21, cs-23, cs-24), an SJ1 or SJ2 breach must still say plainly what the operator has to do or decide, using the gist of `waiting_on_operator`.
- On items with closed facts, an SJ1 or SJ3 breach either leaves the closed facts out or tells them as past.
- An SJ2 or SJ3 breach adds no statement that the ledger does not back. Keep to the ledger's words.

## 4 The `expected` labels

| Row | SJ1 | SJ2 | SJ3 |
|---|---|---|---|
| SJ1 breach on a waiting item | fail | pass | pass |
| SJ1 breach on any other item | fail | pass | open |
| SJ2 breach on a waiting item | open | fail | pass |
| SJ2 breach on any other item | open | fail | open |
| SJ3 breach | pass | pass | fail |
| clean | pass | pass | pass |

Two choices here, on purpose:

- SJ3 is `open` outside the 5 waiting items. The eval gives an empty mark there. The judge is told to pass by rule, so counting those cells would make the true-pass rate look better than it is.
- SJ1 is `open` on SJ2 breaches. A closed fact does back the words of the statement, but not its status, and SJ1 names "a status". A careful reader could call it either way, so it is not a label.

Must-pass cells with these labels: SJ1 25 (20 SJ3 breaches and 5 clean), SJ2 45, SJ3 22 (10 SJ1 breaches and 7 SJ2 breaches on waiting items, and 5 clean). Each is at least 20, as the gating rule of section 3 needs. Keep the item allocation of sections 5 to 7, or the SJ3 count falls under 20.

## 5 SJ1: four ways to break it

Each way puts one unsupported statement into an otherwise clean story. 10 obvious, 10 subtle.

| Way | What to write | Items | Subtlety |
|---|---|---|---|
| A. Invented event | a piece of work or a result no fact mentions at all ("added rate limiting to POST /refunds", "new-b passed a failover test") | cs-01, cs-03, cs-07, cs-23, cs-24 | 5 obvious |
| B. Invented reason | a decision with a reason the ledger does not give. Obvious: replace the ledger reason. Subtle: keep the ledger reason and add a second, plausible one ("... and to cut server load") | cs-05 (f4), cs-04 es (f3): obvious. cs-16 (f6 or f7), cs-12 (f6), cs-21 (f14): subtle | 2 obvious, 3 subtle |
| C. Open fact told with a wrong status | an open `now` or `next` fact told as finished. Use only open facts, never a closed one (that is SJ2) | cs-02 (f6 "every sample is verified"), cs-06 (f18 "the stack check is wired into checkout"), cs-11 (f6 "the CPU rule is removed"): obvious. cs-12 (f14 "reproduced the double rename"), cs-21 (f26 "the empty state is built"): subtle | 3 obvious, 2 subtle |
| D. Wrong name, number or place | swap one detail for another that also appears in the ledger, or write a wrong number in words, so S11 does not catch it | cs-07 ("the production gateway serves the new certificate", ledger f12 says staging), cs-24 (a wrong label in f2, a plain word such as "docs"), cs-23 ("audit-sink and mail-relay still read from old-a", ledger f78 says cron-runner), cs-10 es (Scale 600 instead of 6000), cs-08 (the "2 GB container" in f10's reason, ledger says 512 MB) | 5 subtle |

Waiting items take 10 SJ1 breaches: cs-07 (A, D), cs-12 (B, C), cs-21 (B, C), cs-23 (A, D), cs-24 (A, D). Each of these must still state the operator need in full.

Avoid on cs-23: telling consumers as moved (f109, f110) touches the closed claim f73. Use way A or D there, as listed.

Evidence for SJ1: `"<exact span of the story>" is backed by no fact; nearest: <fid> (<section>, <state>) "<fact text or reason>"`. For way A, write `nearest: none` when no fact is close.

## 6 SJ2: four ways to break it

Use only items with planted closed facts: cs-07, cs-09, cs-13, cs-18, cs-19, cs-20, cs-21, cs-22, cs-23. The notes list them. 10 obvious, 10 subtle.

| Way | What to write | Items (closed fact) | Subtlety |
|---|---|---|---|
| A. Superseded decision told as current | state the old decision in the present, as the design, and leave out the new one | cs-09 (f3 localStorage), cs-18 (f12 fixed sleep), cs-21 (f4 500 ms), cs-22 es (f2 30 days), cs-23 (f9 "the plan is a one-step cutover in a 30-minute maintenance window") | 5 obvious |
| B. Answered question told as still pending | say the operator still has to answer the question of a `needs` fact closed as answered. Leave out the decision that answered it | cs-07 (f8 old CA), cs-13 (f6 partial files), cs-18 (f52 full quota), cs-20 (f2 recalculating invoices), cs-23 (f33 retention) | 5 obvious |
| C. Wrong claim told as true | state the claim of a fact closed as wrong, among true statements | cs-09 (f39 flicker from the legend, once as a fact, once as the planned fix: "next, stop the legend re-rendering that causes the flicker"), cs-19 (f3 all 22 fixtures pass, twice with different wording and other true facts around it), cs-23 (f73 all 9 consumers moved) | 5 subtle |
| D. Closed value blended into the current fact | tell the current fact, but slip the closed value into it, so the story reads as one current rule | cs-21 ("debounced by 500 ms and the previous request is cancelled"), cs-22 es ("conserva las 20 más recientes y borra las de más de 30 días"), cs-18 ("a token bucket refilled every 100 ms, with a fixed sleep between chunks"), cs-19 (goal f1 + f5: "infer every date column automatically when --infer-dates is set"), cs-07 ("the old CA stays until 2027-01-15, pending the operator's final word") | 5 subtle |

Waiting items take 7 SJ2 breaches: cs-07 (B, D), cs-21 (A, D), cs-23 (A, B, C). Each must still state the real open need. On cs-07 and cs-23 way B, the story names two operator matters: the answered one told as pending (the breach) and the real open need (stated right).

Evidence for SJ2: `"<exact span of the story>" tells as current <fid> (closed as <why>) "<fact text>"; replaced by <current fid> "<its text>"`.

## 7 SJ3: four ways to break it

Only the 5 waiting items. Each item takes all four ways once, except as noted. The story must not say that nothing waits (that is unsupported, so it would break SJ1 too), and must not invent a wrong action for the operator (also SJ1). 10 obvious, 10 subtle.

| Way | What to write | Items | Subtlety |
|---|---|---|---|
| A. Left out | a full story of goal, work, decisions and next steps, with no word about the operator or the open need | cs-07, cs-12, cs-21, cs-23, cs-24 | 5 obvious |
| B. Bare wait | say only that something waits ("one point still waits on the operator", "the work is blocked on the operator") with nothing on what | cs-07, cs-12, cs-21, cs-23, cs-24 | 5 obvious |
| C. Decoy operator | name the operator only in a settled matter, in the past, and leave the open need out | cs-07 twice (f11 "the operator said two partner clients still pin it"; f8 told as answered), cs-23 twice (f41 "as the operator confirmed"; f26 "the operator rejected any downtime for mail-relay") | 4 subtle |
| D. Hidden content | give the operator an action that sounds concrete but whose object is a pointer ("has to answer the open question first", "must give the go-ahead the next step depends on"), never the subject itself | cs-12 twice, cs-21 twice, cs-24 twice, each with other wording | 6 subtle |

On cs-12 never name the double-rename policy together with the operator: f16 says the operator chooses it, so that would pass. On cs-23 do not use rule f3 (operator sign-off) as a decoy: it reads as an action of the operator.

Evidence for SJ3: for A and C, `the story never says <gist>; open needs <ids>: "<needs fact text>"`. For B and D, `"<exact span of the story>" says something waits but not what; open needs <ids>: "<needs fact text>"`.

## 8 Clean answers

Write 5, one per waiting item: cs-07, cs-12, cs-21, cs-23, cs-24.

- Correct `ops` from section 3.
- Only statements the ledger backs, in its own words. No invented links between facts ("so the rollout is safe"), no count of your own.
- Closed facts left out, or told as past with the replacement ("the 500 ms debounce was replaced by 150 ms with the previous request cancelled").
- One sentence that says what the operator has to do or decide, close to the gist.

Evidence for a clean row: `null`.

## 9 Row shape

One JSON line per answer in `evals/judge-agreement/dataset-b.jsonl`:

| Field | Value |
|---|---|
| `id` | `jb-SJ1-01` to `jb-SJ1-20`, the same for SJ2 and SJ3; `jb-curator-story-clean-01` to `-05` |
| `eval` | `"curator-story"` |
| `source` | the item id, such as `"cs-07-verbatim-waiting-medium"` |
| `answer` | the raw answer text as a JSON string: `"{\"ops\":[...],\"story\":\"...\"}"` |
| `breach` | `"SJ1"`, `"SJ2"`, `"SJ3"` or `null` |
| `expected` | `{"SJ1": ..., "SJ2": ..., "SJ3": ...}` from section 4 |
| `evidence` | a string as given per criterion, or `null` for a clean row |

Number the rows so that rows 01 to 10 of each criterion are the obvious ones and 11 to 20 the subtle ones.

Worked examples. Each one was checked: it parses and passes every code criterion.

SJ1, way D, subtle, cs-07:

```json
{"id":"jb-SJ1-11","eval":"curator-story","source":"cs-07-verbatim-waiting-medium","answer":"{\"ops\":[{\"op\":\"close\",\"id\":\"f22\",\"why\":\"merged\",\"into\":\"f12\"}],\"story\":\"The goal is to rotate the gateway TLS certificates before they expire on 2026-12-01. cert-renewer issued new certificates for gw.bramble.test and api.bramble.test, and the production gateway now serves the new certificate with a passing handshake check. The old intermediate CA stays in the bundle until 2027-01-15, because the operator said two partner clients still pin it. Production rolls one region at a time, eu-1 first. The operator must approve the production rollout window: Tuesday 02:00 UTC or Thursday 02:00 UTC.\"}","breach":"SJ1","expected":{"SJ1":"fail","SJ2":"pass","SJ3":"pass"},"evidence":"\"the production gateway now serves the new certificate with a passing handshake check\" is backed by no fact; nearest: f12 (done, open) \"The staging gateway serves the new certificate and the handshake check passes\""}
```

SJ2, way B, obvious, cs-20:

```json
{"id":"jb-SJ2-06","eval":"curator-story","source":"cs-20-closed-answered-small","answer":"{\"ops\":[],\"story\":\"The goal is to round tax per line item instead of per order. Tax is rounded half-up per line in TaxCalculator, and the totals match the 18 reference invoices from finance. The operator still has to confirm whether existing invoices are recalculated. Next, per-line rounding gets enabled behind the flag tax_line_rounding in staging.\"}","breach":"SJ2","expected":{"SJ1":"open","SJ2":"fail","SJ3":"open"},"evidence":"\"The operator still has to confirm whether existing invoices are recalculated\" tells as current f2 (closed as answered) \"Operator must confirm whether existing invoices are recalculated\"; replaced by f4 \"Existing invoices are not recalculated\""}
```

SJ3, way C, subtle, cs-23:

```json
{"id":"jb-SJ3-11","eval":"curator-story","source":"cs-23-closed-waiting-large","answer":"{\"ops\":[],\"story\":\"The goal is to move queue-broker from cluster old-a to cluster new-b without losing a message. Because the operator rejected any downtime for mail-relay, the queues are mirrored to new-b and the consumers move service by service. Message retention on new-b is 7 days, the same as on old-a, as the operator confirmed. 7 of the 9 consumers read from new-b; cron-runner and audit-sink still read from old-a. The consumer of cron-runner is moving now, and the mirrors are deleted once both remaining consumers are moved.\"}","breach":"SJ3","expected":{"SJ1":"pass","SJ2":"pass","SJ3":"fail"},"evidence":"the story never says the operator has to provide the firewall change so that audit-sink reaches new-b on port 5671; open needs f90: \"Operator must provide the firewall change that lets audit-sink reach new-b on port 5671\""}
```

Clean, cs-24:

```json
{"id":"jb-curator-story-clean-05","eval":"curator-story","source":"cs-24-waiting-small","answer":"{\"ops\":[],\"story\":\"The goal is to generate the changelog page from the labels of merged pull requests. scripts/changelog.ts now builds docs/changelog.md from the labels feature, fix and breaking. An unlabelled pull request fails the docs build, because silently skipped entries left 5 fixes out of release 3.2. The operator must decide whether internal-only changes appear in the public changelog. Next, the generator runs on the last 3 releases and the result is compared with the hand-written pages.\"}","breach":null,"expected":{"SJ1":"pass","SJ2":"pass","SJ3":"pass"},"evidence":null}
```

## 10 Check that an answer parses

The parser entry point is `grade(item, text)` in `evals/curator-story/scoring.ts`. The judge runs only when `grade(...).parsed` is true. `judgeView(item, text).answer` in `evals/curator-story/judge-criteria.ts` is the exact story the judge sees; it must not be empty. Load items with `loadItems()` from `evals/curator-story/prompt.ts`.

Put a script like this in the scratchpad, not in the repository, and run it from `evals/` with `bun <path>`:

```ts
import { readFileSync } from 'node:fs';
import { loadItems } from '<evals>/curator-story/prompt.ts';
import { grade, outsideTokens } from '<evals>/curator-story/scoring.ts';
import { judgeView } from '<evals>/curator-story/judge-criteria.ts';

const items = new Map(loadItems().map((item) => [item.id, item]));
const rows = readFileSync('<evals>/judge-agreement/dataset-b.jsonl', 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
for (const row of rows.filter((row) => row.eval === 'curator-story')) {
    const item = items.get(row.source);
    if (item === undefined) { console.log(row.id, 'unknown source'); continue; }
    const graded = grade(item, row.answer);
    const bad = Object.entries(graded.marks).filter(([, mark]) => mark === false).map(([id]) => id);
    const story = judgeView(item, row.answer).answer;
    console.log(row.id, graded.parsed && bad.length === 0 && story !== '' ? 'ok' : `FAIL ${bad.join(',')}`, outsideTokens(item, story).join(' '));
}
```

Every row must print `ok`: parsed, no code criterion false (null is fine), a story the judge can see. If S11 fails, the third column lists the tokens to fix.

## 11 Last checks before handing over

- 20 rows per criterion, 10 obvious and 10 subtle, ways and items as in sections 5 to 7. 5 clean rows.
- Read each breached story once more as the judge would. It must break its own criterion beyond doubt and pass the other two.
- `expected` follows section 4 exactly. SJ3 must-pass cells add up to at least 20.
- Every row prints `ok` in the check of section 10.
