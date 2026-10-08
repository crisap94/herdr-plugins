# Summary (numbers only)

- calls per repetition: 228 (198 points + 30 briefs); answers missing after retries: 0; calls needing a retry: 0
- tokens (input, estimated as bytes/4): 645796; money reported: $0.2426

## Per arm and question (both repetitions)

| arm | question | n | labelled 1 | AUC | Brier | undecided | drift | median ms | p95 ms | tokens | usd |
|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-medium | closes_request | 198 | 87 | 0.919 | 0.127 | 0.098 | 0.051 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | announces_continuation | 198 | 122 | 0.982 | 0.066 | 0.086 | 0.043 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | asks_detailed_choice | 198 | 14 | 0.995 | 0.020 | 0.038 | 0.026 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | needs_verbatim | 198 | 0 | n/a | 0.027 | 0.010 | 0.035 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | changes_subject | 198 | 3 | 0.992 | 0.018 | 0.013 | 0.029 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | stuck | 198 | 1 | 1 | 0.004 | 0.005 | 0.011 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | brief_keeps_fact | 485 | 322 | 0.838 | 0.167 | 0.053 | 0.126 | 7612 | 15036.500 | 169228 | 0.076 |
| haiku-medium | brief_keeps_reason | 88 | 59 | 0.716 | 0.300 | 0.057 | 0.154 | 7612 | 15036.500 | 169228 | 0.076 |


## Per policy (mean of the repetitions)

| arm | precision (all) | recall (all) | compact verdicts | precision (share ≥ 40) | recall (share ≥ 40) | drift (mean of 6) | coverage AUC |
|---|---|---|---|---|---|---|---|
| haiku-medium | 0.905 | 0.647 | 36.500 | 0.933 | 0.522 | 0.032 | 0.777 |


## Outcome set (16 compactions with a stored run before them)

| arm | allowed n | allowed re-reads | allowed restated | blocked n | blocked re-reads | blocked restated |
|---|---|---|---|---|---|---|
| haiku-medium | 11 | 0 | 0.091 | 11 | 0 | 0.636 |

