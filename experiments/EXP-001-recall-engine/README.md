# EXP-001 · Which steps of the 2.1 recall engine raise what a recap recalls, at what cost?

| Field | Value |
|---|---|
| Status | **running** — three of the four arms measured under the state ruler (R05–R07); `full` (R08) being judged |
| Decision | pending R08. So far: **adopt** the state ruler and the anchors with the 2.1 gates (coverage 78 → 83 %, every fact anchored, 0 dropped); **enumeration alone moves nothing** that counts (coverage 70 %, read-back 1.5/6, filler worse); read-back is still 2/6 against a bar of 4/6 in every arm |
| Owner | the reviewer (main session); arms run by the coders recall-a and recall-b |
| Dates | 2026-10-07 → |
| Parent | OpenSpec change `recall-engine` (`b56ce24`, !41): design decisions 1, 3, 5, 9 and task 3.5 |
| Pre-registration | [`PREREG.md`](PREREG.md), frozen as the OpenSpec design before any run |
| Manifest | [`manifest.yaml`](manifest.yaml) |
| Links | !41 (spec), !42 (ruler, anchors, gates, calibration), the pipeline MR (pending) |

## Question and hypothesis

tab-recap 2.0 measured its recaps and found recall weak: key-fact coverage 33 %, read-back 0–47 % (memory `tab-recap-2-0-decisions`). The 2.1 design answers with five steps and demands that each one be measured on its own and dropped when it moves nothing. The question is which steps earn their place.

- **H1 (ruler).** Measuring over the ledger's open state instead of a run's additions raises the coverage number without changing the recaps: the 33 % was a floor. Confirmed if `one` under the state ruler is far above 33 %.
- **H2 (anchors + gates).** A verbatim anchor per fact, checked in code, raises the judge's supported rate (I4) and loses nothing after the short retry. Confirmed if I4 rises and "items dropped after the retry" stays at 0.
- **H3 (enumeration).** Reading a turn per chunk and section raises coverage and the read-back. Confirmed if `enumerate` or `enumerate+gates` beats `one` beyond the noise floor on coverage or the read-back median.
- **H4 (ask-back).** Asking the six read-back questions of the turn before reconciling raises the read-back median. Confirmed if `full` beats `enumerate+gates` on the median beyond the floor.

## Method

- **Corpus.** One real session of the operator's, 40 prompts, 23 turns after grouping (`replay-mine-40.jsonl`, private, SHA-256 in the manifest). One corpus, so every arm sees the same text.
- **Arms.** `--pipeline one | enumerate | enumerate+gates | full`, as PREREG §3. `one` is the control.
- **Metrics.** PREREG §5: state coverage and read-back median primary; I4, I7, no-filler, anchors found, G11 refusals, drops, judge-vs-anchor, unparsed judge answers secondary; model calls per turn as the cost.
- **Judge.** The same `codex · gpt-6-luna · medium` for every arm; score, read-back and grade per judged run.
- **Environment.** One workstation, each run in its own scratch database; R04 ran its four arms in parallel, R05–R08 one arm at a time.
- **Decision rule.** PREREG §6 (design decision 9) and the noise floor of §7.

## Runs

| Run | Status | What changed | Outcome |
|---|---|---|---|
| [R01](runs/R01-ruler-one/run.yaml) | valid | 2.0 pipeline, state ruler only | coverage 75 % (added 16 %), read-back 2/6 |
| [R02](runs/R02-gates-one-a/run.yaml) | valid | + G11/G12, G4/G5 as flags, short retry | coverage 84 %, I4 89 %, read-back 2/6 |
| [R03](runs/R03-gates-one-b/run.yaml) | valid | same configuration as R02 (noise floor) | coverage 85 %, I4 90 %, 67/67 anchored, G11 5 refused → 0 dropped |
| [R04](runs/R04-parallel-one/run.yaml) ×4 | superseded | four arms in parallel, old ruler, pre-rebase code | coverage over additions 33 / 42 / 42 / 53 %; kept as the parallel noise sample |
| [R05](runs/R05-one/run.yaml) | valid | `one`, merged code, sequential | coverage 78 %, I4 87 %, read-back 1/6, 1.17 calls/turn |
| [R06](runs/R06-enumerate/run.yaml) | valid | `enumerate` (2.0 gate set) | coverage 70 %, I4 95 %, read-back 1.5/6, 2.48 calls/turn |
| [R07](runs/R07-enumerate-gates/run.yaml) | valid | `enumerate+gates` (2.1 set, retry) | coverage 83 %, I4 89 %, read-back 2/6, 2.39 calls/turn |
| [R08](runs/R08-full/run.yaml) | running | `full` (+ ask-back) | judging; 2.91 calls/turn |

## Results

State ruler, 40-prompt replay, 23 turns, one run per arm (R05–R08). Secondary numbers from each run's `summary.md`.

| | one (R05) | enumerate (R06) | enumerate+gates (R07) | full (R08) |
|---|---|---|---|---|
| facts stored (open) | 70 (49) | 114 (78) | 140 (98) | |
| state coverage | 78 % (177/227) | 70 % (198/281) | 83 % (236/286) | |
| coverage over additions (old ruler) | 23 % | 29 % | 33 % | |
| no-filler (state) | 34 % | 21 % | 19 % | |
| read-back median | 1/6 | 1.5/6 | 2/6 | |
| read-back per question 1–6 | 41·35·24·0·0·18 | 50·41·18·50·5·0 | 55·32·5·68·50·9 | |
| I4 supported | 87 % | 95 % | 89 % | |
| I7 still true | 95 % | 98 % | 94 % | |
| anchors found in the input | 70/70 | 114/114 | 140/140 | |
| G11 refused → dropped | 2 → 0 | 0 → 0 | 3 → 0 | |
| judge vs anchor | 8 | 6 | 15 | |
| runs judged | 17/19 | 22/22 | 22/23 | |
| model calls per turn | 1.17 | 2.48 | 2.39 | 2.91 |

The ruler alone (R01 vs the 2.0 number): 33 % → 75 % on the same pipeline; the gates (R02, R03): 84–85 % and I4 84 → 89–90 %.

## Anomalies and threats to validity

- **One run per arm.** The floor from R02/R03 is coverage ±1, read-back median 0, I4 ±1, single read-back questions up to ±60 points. Only coverage, the median and I4 are read as signal.
- **The judge drops runs.** 1–3 of 19–23 judged runs per pass come back as invalid JSON (the long `score` answer at medium effort) and are not counted; denominators differ between arms.
- **No-filler is bounded.** The judge lists at most 15 key facts per run against 20–98 open facts, so it falls as the ledger grows; it is reported, not decided on.
- **The state shows a fact's latest text** (design decision 3), so an earlier run's state can carry wording written later.
- **Cost is calls, not money.** The codex harness reports no price; enumeration calls are at low effort and cheaper than a writer call, so "2.5×" on calls overstates the money.
- **R04** mixed the old ruler, pre-rebase code and parallel execution; it is kept to show why the sequential runs were needed, and is not read for a decision.
- **One session, one operator.** The corpus is a single real session; the per-chapter 1.x comparison (`--compare-imported`) was not run because no tab's 1.x chapters overlap the replay's span.

## Interpretation and decision

Pending R08. What the evidence already supports:

- H1 confirmed: the 2.0 recaps carried 75 % of the key facts; the 33 % was the ruler.
- H2 confirmed: with anchors every stored fact quotes its input, I4 rises from 84–87 % to 89–95 %, the retry fixes every G11 refusal and nothing is dropped. The anchor is not a proof of support: 5–15 anchored facts per arm are still called unsupported by the judge (a past-tense claim or a plan the quote does not say), which is what the operator's 50-label calibration pass is for.
- H3 not confirmed: enumeration alone (R06) adds facts but not key facts (coverage 70 %, filler 21 %) and leaves the median at 1.5/6; with the 2.1 gates (R07) coverage reaches 83 %, within the floor of the gated control (84–85 % in R02/R03), and the median 2/6 equals the control's. The gates do the work, not the enumeration.
- H4 decided by R08.

## Next steps

1. R08 `full`: decide H4; then apply task 3.5 (drop what moved nothing) and set `TAB_RECAP_PIPELINE`'s default.
2. The operator's 50 labels (`eval --label 50`, `--check I5`, `--check I7`, `--agree`) on the live database: kappa ≥ 0.6 before the judge's I4 and I7 are trusted for the acceptance.
3. The live check as the daemon (task 5.1), then acceptance (5.2) against PREREG §6.

## Reproducibility checklist

- [ ] Code commit recorded for every run — R01–R03 ran on uncommitted snapshots of recall-a's tree (described, not hashed); R05–R08 on `dadb961` plus the reconciliation fixes (final commit added when the MR lands)
- [x] Corpus versioned and hashed (`manifest.yaml`; private)
- [ ] Container images pinned by digest or checksum — none: Node v24.21.0 and codex-cli 0.161.0 on the host
- [x] Exact commands in every `run.yaml`
- [x] Resource limits and host recorded (`manifest.yaml`)
- [x] Raw outputs kept, not only summaries (on the private branch; `REMOVED-ON-MAIN.txt`)
- [x] Invalid or superseded runs kept and explained (R04)
- [x] Known limitations stated

## Code and raw runs

The code is the 2.1 release on `main` (!42 and the pipeline MR). The corpus and every raw replay output quote a real session and stay on the private branch; [`REMOVED-ON-MAIN.txt`](REMOVED-ON-MAIN.txt) lists each file with its size and `branch@commit`.
