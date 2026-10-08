# EXP-002 · Which decider should autocompact use, and do its questions separate safe moments?

| Field | Value |
|---|---|
| Status | concluded 2026-10-08 (operator labels pending) |
| Decision | **adopt**. The moment questions run on the recap writer's harness at low effort (Claude Haiku 5.5 here). The brief check runs on Jev when a key is found, otherwise on the same harness. |
| Owner | the reviewer (main session); one coder built the tools and ran the arms |
| Dates | 2026-10-08 → 2026-10-08 |
| Parent | OpenSpec `autocompact` (design decision 9) |
| Links | spec !50, `PREREG.md`, `runs/` |

## Question and hypothesis

Which decider should autocompact use by default? The candidates are a hosted typed-judgment model (Jev) and a
coding-agent harness the operator already has. The second question is whether the six questions separate a
safe moment from an unsafe one at all.

- **Confirmed** for a question when its AUC is clearly above 0.5 in every arm and its undecided rate is low.
- **Refuted** for a question when it sits near 0.5 or in the undecided band in most cases.

## Method

- **Corpus:** 198 points from 306 stored `turn-ended` runs of Claude lanes (seed 42):
  - 120 with a share ≥ 40 %;
  - 18 that are the last turn end before an agent's own compaction (60 were asked; 18 exist);
  - 60 at random.

  The state is built by the plugin's own code from the transcript tail and the ledger. There are 30
  regenerated briefs with 485 fact/brief pairs and 88 decision reasons. The outcome set is 233 compaction
  boundaries from 30 days of transcripts; 11 of them have a stored run before them and something after.
- **Labels:** a pinned hindsight labeller (Codex `gpt-6.1-sol`, effort high) reads each point's state plus
  what happened next. A deterministic cross-check covers `needs_verbatim`. The 60 operator labels are
  **pending**.
- **Arms:** `jev` (`jev-1.13.0`); `haiku-low` and `haiku-medium` (Claude harness, `claude-haiku-5-5`);
  `luna-low` (Codex harness, `gpt-6-luna`). Each arm ran twice.
- **Decision rule** (frozen in `PREREG.md`): the default is the arm needing nothing beyond the recap writer's
  harness, if its policy precision is within 3 points of the best and its drift is ≤ 0.15. The brief check
  uses the arm with the best `brief_keeps_*` AUC.

## Runs

| Run | Status | What | Outcome |
|---|---|---|---|
| R00-corpus | valid | sample, states, hindsight, outcome set | 198 points (boundary stratum short by 42) |
| R01-labels | valid | labeller, cross-check, brief corpus | 198/198 labelled in 4 min 56 s |
| R02-jev / -haiku-low / -haiku-medium / -luna-low | valid | arms × 2 repetitions | all answered; 3 transient retries |
| R03-report | valid | metrics and the rule | default `haiku-low`, brief check `jev` |

## Results

**Policy** (mean of the two repetitions; 51 of the 198 points are labelled safe):

| Arm | Precision | Recall | Compact verdicts | Precision, share ≥ 40 | Drift | Brief-check AUC | Median ms |
|---|---|---|---|---|---|---|---|
| jev | 0.957 | 0.431 | 23 | 1 | 0.007 | **0.912** | 251 |
| haiku-low | **0.981** | 0.529 | 27.5 | 1 | 0.039 | 0.693 | 2 795 |
| haiku-medium | 0.905 | 0.647 | 36.5 | 0.933 | 0.032 | 0.777 | 3 427 |
| luna-low | 0.902 | 0.569 | 32 | 0.902 | 0.070 | 0.821 | 4 801 |

**Questions** (AUC against the labeller):

| Question | Labelled yes | jev | haiku-low | haiku-medium | luna-low |
|---|---|---|---|---|---|
| closes_request | 87 | 0.917 | 0.887 | 0.919 | 0.838 |
| announces_continuation | 122 | 0.972 | 0.977 | 0.982 | 0.969 |
| asks_detailed_choice | 14 | 0.995 | 0.990 | 0.995 | 0.907 |
| needs_verbatim | 0 (code check: 12) | n/a (0.690) | n/a (0.410) | n/a (0.377) | n/a (0.515) |
| changes_subject | 3 | 0.989 | 0.988 | 0.992 | 0.991 |
| stuck | 1 | 1 | 1 | 1 | 0.989 |
| brief_keeps_fact | 322 of 485 | 0.953 | 0.752 | 0.838 | 0.805 |
| brief_keeps_reason | 59 of 88 | 0.870 | 0.635 | 0.716 | 0.837 |

**Cost for both repetitions over everything:**
- jev: $0.035, billed;
- haiku-low: $0.139 of plan usage;
- haiku-medium: $0.167 of plan usage;
- luna-low: not reported by the Codex harness.

**Outcome set** (11 comparable boundaries). The operator restated something after:
- 0–9 % of the compactions an arm would have allowed;
- 57–67 % of those it would have blocked.

Files were re-read after 0 compactions on either side.

## Anomalies and threats to validity

- **Small numbers.** The precisions rest on 23–37 `compact` verdicts. Jev and haiku-low differ by about one
  wrong call; haiku-low partly "wins" by compacting less.
- **Three questions cannot be scored.**
  - `needs_verbatim`: the labeller gave no positive. The code check found 12, and every arm is weak on it
    (AUC 0.38–0.69).
  - `stuck` and `changes_subject`: only 1 and 3 positives.

  These AUCs say nothing. `needs_verbatim` protects against losing exact output, so it is the first thing
  to check by hand.
- **No human check.** Operator labels are pending, so no question is checked against a human (kappa).
- **The in-flight gate blocked 118 of 198 points.** This is examined after the experiment: some launches
  never end in the transcript.
- **Tail, not whole session.** Share and recent turns come from the transcript tail the live readers read,
  not the whole session.

## Interpretation and decision

- **Adopt the recap writer's harness at low effort** for the moment questions. It needs nothing new, is the
  most precise here, and is stable.
- **Use Jev for the brief check when a key is found.** It is clearly the best at telling whether a brief kept
  a fact (0.95 vs 0.75) and costs a fraction of a cent. Without a key the harness answers, and the check fails
  closed, so it waits rather than compact unchecked.
- **Ship in shadow mode,** where none of this types anything.

## Next steps

1. The operator labels 60 points (`node bin/autocompact-label.ts --operator 60`, then `--kappa`). Start with
   `needs_verbatim`.
2. A week of shadow decisions, read by hand, before `TAB_RECAP_AUTOCOMPACT=on`.
3. Re-measure `needs_verbatim` with a sharper question, or retire it, if the operator's labels agree with the
   code check rather than the labeller.

## Reproducibility checklist

- [x] Code commit recorded for every run (`runs/*/run.yaml`)
- [x] Corpus versioned and hashed (`R00-corpus/run.yaml`)
- [ ] Container images pinned by digest or checksum (not containerised; CLI versions recorded)
- [x] Exact commands in every `run.yaml`
- [x] Resource limits and host recorded
- [x] Raw outputs kept, not only summaries (scratch only, listed in `REMOVED-ON-MAIN.txt`)
- [x] Invalid runs kept and explained (none invalid)
- [x] Known limitations stated
