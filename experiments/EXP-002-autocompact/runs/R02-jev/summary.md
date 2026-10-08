# Summary (numbers only)

- calls per repetition: 228 (198 points + 30 briefs); answers missing after retries: 0; calls needing a retry: 0
- tokens (input, as Jev reports them): 834578; money reported: $0.0351

## Per arm and question (both repetitions)

| arm | question | n | labelled 1 | AUC | Brier | undecided | drift | median ms | p95 ms | tokens | usd |
|---|---|---|---|---|---|---|---|---|---|---|---|
| jev | closes_request | 198 | 87 | 0.917 | 0.140 | 0.141 | 0.011 | 251 | 351 | 630436 | 0.026 |
| jev | announces_continuation | 198 | 122 | 0.972 | 0.066 | 0.076 | 0.008 | 251 | 351 | 630436 | 0.026 |
| jev | asks_detailed_choice | 198 | 14 | 0.995 | 0.017 | 0.056 | 0.003 | 251 | 351 | 630436 | 0.026 |
| jev | needs_verbatim | 198 | 0 | n/a | 0.034 | 0.018 | 0.007 | 251 | 351 | 630436 | 0.026 |
| jev | changes_subject | 198 | 3 | 0.989 | 0.030 | 0.051 | 0.007 | 251 | 351 | 630436 | 0.026 |
| jev | stuck | 198 | 1 | 1 | 0.020 | 0.020 | 0.006 | 251 | 351 | 630436 | 0.026 |
| jev | brief_keeps_fact | 485 | 322 | 0.953 | 0.097 | 0.227 | 0.024 | 280.500 | 372.150 | 204142 | 0.009 |
| jev | brief_keeps_reason | 88 | 59 | 0.870 | 0.140 | 0.148 | 0.022 | 280.500 | 372.150 | 204142 | 0.009 |


## Per policy (mean of the repetitions)

| arm | precision (all) | recall (all) | compact verdicts | precision (share ≥ 40) | recall (share ≥ 40) | drift (mean of 6) | coverage AUC |
|---|---|---|---|---|---|---|---|
| jev | 0.957 | 0.431 | 23 | 1 | 0.304 | 0.007 | 0.912 |


## Outcome set (16 compactions with a stored run before them)

| arm | allowed n | allowed re-reads | allowed restated | blocked n | blocked re-reads | blocked restated |
|---|---|---|---|---|---|---|
| jev | 8 | 0 | 0 | 14 | 0 | 0.571 |

