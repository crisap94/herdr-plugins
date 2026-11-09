# EXP-001 · Pre-registration

Frozen: the OpenSpec change `recall-engine` as merged to `main` in `b56ce24` (2026-10-07, !41), design decision 9 and task 3.5. Everything below was written there before any run of this experiment. The first run that counts (R01) started after that merge.

| Field | Value |
|---|---|
| Status | **frozen** at `b56ce24` |
| Parent | OpenSpec `recall-engine` (`openspec/changes/recall-engine/{proposal,design,tasks}.md` at that commit) |
| Question owner | the reviewer (main session); two coders ran the arms |

## 1. Question

Which steps of the 2.1 recall engine raise what a recap recalls, on the same transcript, with the same judge, and at what cost per turn?

- **Confirmed** for a step when it moves state coverage or the read-back median beyond the noise between two runs of the same configuration.
- **Refuted** for a step when it moves neither: by task 3.5 of the change, *a pipeline step that moves nothing is dropped before merge*.

## 2. Corpus

The 40-prompt replay of one real session of the operator's (`replay-mine-40.jsonl`, 23 turns after the replay's grouping, 4.49 MB, SHA-256 in `manifest.yaml`). Private: it is never committed to `main`. The 10-prompt subset (`replay-mine-10.jsonl`) is for development only and never counts.

## 3. Arms

`tab-recap eval --replay <corpus> --pipeline <arm>`:

| Arm | What runs |
|---|---|
| `one` | the 2.0 single writer call, with the 2.1 gates and the short retry (the control) |
| `enumerate` | A enumerate per chunk → C reconcile, with the 2.0 gate set |
| `enumerate+gates` | A → C with the 2.1 gate set (G11 anchor, G12 answered, G4/G5 as flags) and the targeted retry |
| `full` | A → B ask-back → C with the 2.1 gate set |

Writer `codex · gpt-6-luna · medium`; enumeration the same harness at `low`; judge `codex · gpt-6-luna · medium`.

## 4. Ruler

From design decision 1: the item checks (I1–I7, S-*) are scored on the facts a run **added**; coverage, no-filler and the six-question read-back are measured on the **ledger's open state right after the run**. The 2.0 numbers over additions were a floor and are reported in brackets only.

## 5. Metrics

Primary: state coverage (key facts carried), read-back median (of 6). Secondary: I4 supported, I7 still true, no-filler, facts with an anchor found in the input, G11 refusals and items dropped after the retry, "judge vs anchor" count, runs the judge could not parse. Cost: model calls per turn (writer + enumeration); the harness reports no price.

## 6. Decision rule (design decision 9)

On the 40-prompt replay with the state ruler, `--pipeline full`, same judge:

- coverage ≥ 70 %;
- median read-back ≥ 4/6;
- anchor-verified supported ≥ 98 %;
- zero duplicates;
- cost per turn ≤ 2.5× one call;
- Cohen's kappa ≥ 0.6 on I5 and I7 after the operator's 50 labels;
- a pipeline step that moves nothing is dropped before merge.

## 7. Noise floor

Two runs of the same configuration (R02 and R03, `one` with the gates) set the floor: coverage ±1 point, read-back median 0, I4 ±1 point, single read-back questions up to ±60 points (17–18 judged runs). A difference inside the floor is "moved nothing".

## 8. Threats known in advance

- The models are not deterministic; one run per arm.
- 1–3 of 19 judged runs per pass come back as invalid JSON and are not counted, so denominators differ between arms.
- The state's text is the fact's latest wording (design decision 3): a fact updated later shows its later text in an earlier run's state.
- The judge lists at most 15 key facts per run; the state holds 20–54 open facts, so no-filler is bounded by that cap.
- Codex reports no dollar cost; the 2.5× bar is read on calls per turn, with the enumeration calls at low effort.
