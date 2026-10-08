# Summary (numbers only)

- calls per repetition: 228 (198 points + 30 briefs); answers missing after retries: 0; calls needing a retry: 2
- tokens (input, estimated as bytes/4): 645796; money reported: $0.2063

## Per arm and question (both repetitions)

| arm | question | n | labelled 1 | AUC | Brier | undecided | drift | median ms | p95 ms | tokens | usd |
|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-low | closes_request | 198 | 87 | 0.887 | 0.154 | 0.053 | 0.065 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | announces_continuation | 198 | 122 | 0.977 | 0.090 | 0.101 | 0.052 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | asks_detailed_choice | 198 | 14 | 0.990 | 0.025 | 0.038 | 0.032 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | needs_verbatim | 198 | 0 | n/a | 0.024 | 0.010 | 0.040 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | changes_subject | 198 | 3 | 0.988 | 0.023 | 0.023 | 0.032 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | stuck | 198 | 1 | 1 | 0.004 | 0.008 | 0.012 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | brief_keeps_fact | 485 | 322 | 0.752 | 0.247 | 0.045 | 0.175 | 4817 | 11904.700 | 169228 | 0.068 |
| haiku-low | brief_keeps_reason | 88 | 59 | 0.635 | 0.385 | 0.051 | 0.222 | 4817 | 11904.700 | 169228 | 0.068 |


## Per policy (mean of the repetitions)

| arm | precision (all) | recall (all) | compact verdicts | precision (share ≥ 40) | recall (share ≥ 40) | drift (mean of 6) | coverage AUC |
|---|---|---|---|---|---|---|---|
| haiku-low | 0.981 | 0.529 | 27.500 | 1 | 0.304 | 0.039 | 0.693 |


## Outcome set (16 compactions with a stored run before them, 11 with something after)

| arm | allowed n | allowed re-reads | allowed restated | blocked n | blocked re-reads | blocked restated |
|---|---|---|---|---|---|---|
| haiku-low | 9 | 0 | 0 | 13 | 0 | 0.615 |

