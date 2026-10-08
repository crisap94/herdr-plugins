# Summary (numbers only)

- calls per repetition: 228 (198 points + 30 briefs); answers missing after retries: 0; calls needing a retry: 1
- tokens (input, estimated as bytes/4): 645796; money reported: $0.0000 (the codex harness reports no price)

## Per arm and question (both repetitions)

| arm | question | n | labelled 1 | AUC | Brier | undecided | drift | median ms | p95 ms | tokens | usd |
|---|---|---|---|---|---|---|---|---|---|---|---|
| luna-low | closes_request | 198 | 87 | 0.838 | 0.165 | 0.184 | 0.099 | 4800.500 | 8679.250 | 476568 | 0 |
| luna-low | announces_continuation | 198 | 122 | 0.969 | 0.049 | 0.038 | 0.069 | 4800.500 | 8679.250 | 476568 | 0 |
| luna-low | asks_detailed_choice | 198 | 14 | 0.907 | 0.023 | 0.005 | 0.037 | 4800.500 | 8679.250 | 476568 | 0 |
| luna-low | needs_verbatim | 198 | 0 | n/a | 0.034 | 0.073 | 0.087 | 4800.500 | 8679.250 | 476568 | 0 |
| luna-low | changes_subject | 198 | 3 | 0.991 | 0.092 | 0.295 | 0.114 | 4800.500 | 8679.250 | 476568 | 0 |
| luna-low | stuck | 198 | 1 | 0.989 | 0.007 | 0.020 | 0.017 | 4800.500 | 8679.250 | 476568 | 0 |
| luna-low | brief_keeps_fact | 485 | 322 | 0.805 | 0.182 | 0.003 | 0.141 | 5436 | 9693.100 | 169228 | 0 |
| luna-low | brief_keeps_reason | 88 | 59 | 0.837 | 0.166 | 0.006 | 0.119 | 5436 | 9693.100 | 169228 | 0 |


## Per policy (mean of the repetitions)

| arm | precision (all) | recall (all) | compact verdicts | precision (share ≥ 40) | recall (share ≥ 40) | drift (mean of 6) | coverage AUC |
|---|---|---|---|---|---|---|---|
| luna-low | 0.902 | 0.569 | 32 | 0.902 | 0.435 | 0.070 | 0.821 |


## Outcome set (16 compactions with a stored run before them)

| arm | allowed n | allowed re-reads | allowed restated | blocked n | blocked re-reads | blocked restated |
|---|---|---|---|---|---|---|
| luna-low | 10 | 0 | 0 | 12 | 0 | 0.667 |

