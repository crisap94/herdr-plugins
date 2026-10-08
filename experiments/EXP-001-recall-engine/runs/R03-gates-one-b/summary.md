# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline one · writer codex/gpt-6-luna · judge codex · gpt-6-luna · medium
```

- replay: 23 turns: 67 facts, 47 open, 20 closed
- facts with an anchor found in the input: 67 of 67 (100%)
- G8   0 refused  4 flagged
- G11  5 refused  0 flagged
- 0 items dropped after the retry
- tab-recap eval — judge codex · gpt-6-luna · medium — 19 runs sampled, 16 judged
- judge vs anchor (5)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 86% | 43/50 |
| I2 | 96% | 48/50 |
| I3 | 96% | 48/50 |
| I4 | 90% | 45/50 |
| I5 | 100% | 50/50 |
| I6 | 100% | 50/50 |
| I7 | 98% | 49/50 |
| S-goal | 100% | 1/1 |
| S-now | 60% | 3/5 |
| S-needs | 60% | 9/15 |
| S-done | 100% | 14/14 |
| S-decisions | 25% | 1/4 |
| S-next | 83% | 5/6 |
| S-rules | 100% | 1/1 |
| S-links | 100% | 4/4 |
| coverage | 85% | 201/237 |
| filler | 50% | 199/399 |
| readback-1 | 100% | 16/16 |
| readback-2 | 25% | 4/16 |
| readback-3 | 31% | 5/16 |
| readback-4 | 63% | 10/16 |
| readback-5 | 6% | 1/16 |
| readback-6 | 6% | 1/16 |

## All judged runs (state after each run; added in brackets)

```
coverage 85% (201/237) [added 16% (37/237)]
no-filler 50% (199/399) [added 70% (35/50)]
read-back median 2/6
```
