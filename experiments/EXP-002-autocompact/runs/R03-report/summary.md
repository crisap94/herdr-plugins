# Summary (numbers only)

## Labels

198 points, 198 labelled, 125 at or above the soft limit; positives per question: closes_request 87 · announces_continuation 122 · asks_detailed_choice 14 · needs_verbatim 0 · changes_subject 3 · stuck 1; labelled safe (verdict compact): 51.

## Operator kappa

Operator labels are pending: no question is gated by kappa yet.

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
| haiku-low | closes_request | 198 | 87 | 0.887 | 0.154 | 0.053 | 0.065 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | announces_continuation | 198 | 122 | 0.977 | 0.090 | 0.101 | 0.052 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | asks_detailed_choice | 198 | 14 | 0.990 | 0.025 | 0.038 | 0.032 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | needs_verbatim | 198 | 0 | n/a | 0.024 | 0.010 | 0.040 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | changes_subject | 198 | 3 | 0.988 | 0.023 | 0.023 | 0.032 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | stuck | 198 | 1 | 1 | 0.004 | 0.008 | 0.012 | 2795 | 5974.250 | 476568 | 0.139 |
| haiku-low | brief_keeps_fact | 485 | 322 | 0.752 | 0.247 | 0.045 | 0.175 | 4817 | 11904.700 | 169228 | 0.068 |
| haiku-low | brief_keeps_reason | 88 | 59 | 0.635 | 0.385 | 0.051 | 0.222 | 4817 | 11904.700 | 169228 | 0.068 |
| haiku-medium | closes_request | 198 | 87 | 0.919 | 0.127 | 0.098 | 0.051 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | announces_continuation | 198 | 122 | 0.982 | 0.066 | 0.086 | 0.043 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | asks_detailed_choice | 198 | 14 | 0.995 | 0.020 | 0.038 | 0.026 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | needs_verbatim | 198 | 0 | n/a | 0.027 | 0.010 | 0.035 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | changes_subject | 198 | 3 | 0.992 | 0.018 | 0.013 | 0.029 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | stuck | 198 | 1 | 1 | 0.004 | 0.005 | 0.011 | 3426.500 | 5928.250 | 476568 | 0.167 |
| haiku-medium | brief_keeps_fact | 485 | 322 | 0.838 | 0.167 | 0.053 | 0.126 | 7612 | 15036.500 | 169228 | 0.076 |
| haiku-medium | brief_keeps_reason | 88 | 59 | 0.716 | 0.300 | 0.057 | 0.154 | 7612 | 15036.500 | 169228 | 0.076 |
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
| jev | 0.957 | 0.431 | 23 | 1 | 0.304 | 0.007 | 0.912 |
| haiku-low | 0.981 | 0.529 | 27.500 | 1 | 0.304 | 0.039 | 0.693 |
| haiku-medium | 0.905 | 0.647 | 36.500 | 0.933 | 0.522 | 0.032 | 0.777 |
| luna-low | 0.902 | 0.569 | 32 | 0.902 | 0.435 | 0.070 | 0.821 |

## Outcome set (16 compactions with a stored run before them)

| arm | allowed n | allowed re-reads | allowed restated | blocked n | blocked re-reads | blocked restated |
|---|---|---|---|---|---|---|
| jev | 8 | 0 | 0 | 14 | 0 | 0.571 |
| haiku-low | 9 | 0 | 0 | 13 | 0 | 0.615 |
| haiku-medium | 11 | 0 | 0.091 | 11 | 0 | 0.636 |
| luna-low | 10 | 0 | 0 | 12 | 0 | 0.667 |

## needs_verbatim against the code cross-check as labels

| arm | positives | AUC | Brier |
|---|---|---|---|
| jev | 12 | 0.690 | 0.070 |
| haiku-low | 12 | 0.410 | 0.071 |
| haiku-medium | 12 | 0.377 | 0.072 |
| luna-low | 12 | 0.515 | 0.084 |

## Rule

Default decider: **haiku-low**. Coverage decider: **jev**.

haiku-low: a recap-writer harness within 3 points of the best precision (0.981) with drift 0.039 ≤ 0.15

