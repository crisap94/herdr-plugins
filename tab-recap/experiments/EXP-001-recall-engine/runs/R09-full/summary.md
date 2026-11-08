# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline full · writer codex/gpt-6-luna medium · enumeration codex · gpt-6-luna · low · judge codex · gpt-6-luna · medium
```

- replay: 23 turns: 146 facts, 103 open, 43 closed
- facts with an anchor found in the input: 146 of 146 (100%)
- G1   3 refused  0 flagged
- G2   1 refused  0 flagged
- G4   0 refused  7 flagged
- G8   0 refused  9 flagged
- G11  6 refused  0 flagged
- tab-recap eval — judge codex · gpt-6-luna · medium — 21 runs sampled, 21 judged
- judge vs anchor (8)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 92% | 135/146 |
| I2 | 98% | 143/146 |
| I3 | 97% | 142/146 |
| I4 | 95% | 138/146 |
| I5 | 100% | 146/146 |
| I6 | 99% | 144/146 |
| I7 | 95% | 138/146 |
| S-goal | 50% | 2/4 |
| S-now | 67% | 8/12 |
| S-needs | 46% | 11/24 |
| S-done | 91% | 39/43 |
| S-decisions | 32% | 6/19 |
| S-next | 96% | 26/27 |
| S-rules | 75% | 3/4 |
| S-links | 100% | 13/13 |
| coverage | 72% | 192/265 |
| filler | 19% | 186/981 |
| readback-1 | 90% | 19/21 |
| readback-2 | 29% | 6/21 |
| readback-3 | 29% | 6/21 |
| readback-4 | 48% | 10/21 |
| readback-5 | 38% | 8/21 |
| readback-6 | 14% | 3/21 |

## All judged runs (state after each run; added in brackets)

```
coverage 72% (192/265) [added 36% (95/265)]
no-filler 19% (186/981) [added 62% (91/146)]
read-back median 2/6
```
