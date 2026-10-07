# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline full · writer codex/gpt-6-luna medium · enumeration codex · gpt-6-luna · low · judge claude · default · medium
```

- replay: 23 turns: 158 facts, 120 open, 38 closed
- facts with an anchor found in the input: 158 of 158 (100%)
- G1   2 refused  0 flagged
- G2   5 refused  0 flagged
- G4   0 refused  6 flagged
- G8   0 refused  14 flagged
- G11  6 refused  0 flagged
- G12  1 refused  0 flagged
- 2 items dropped after the retry
- tab-recap eval — judge claude · default · medium — 23 runs sampled, 23 judged
- judge vs anchor (13)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 80% | 126/158 |
| I2 | 91% | 144/158 |
| I3 | 87% | 138/158 |
| I4 | 92% | 145/158 |
| I5 | 98% | 155/158 |
| I6 | 99% | 157/158 |
| I7 | 98% | 155/158 |
| S-goal | 100% | 3/3 |
| S-now | 75% | 9/12 |
| S-needs | 63% | 12/19 |
| S-done | 80% | 40/50 |
| S-decisions | 22% | 5/23 |
| S-next | 80% | 24/30 |
| S-rules | 75% | 3/4 |
| S-links | 59% | 10/17 |
| coverage | 86% | 291/337 |
| filler | 22% | 286/1321 |
| readback-1 | 26% | 6/23 |
| readback-2 | 22% | 5/23 |
| readback-3 | 35% | 8/23 |
| readback-4 | 22% | 5/23 |
| readback-5 | 0% | 0/23 |
| readback-6 | 4% | 1/23 |

## All judged runs (state after each run; added in brackets)

```
coverage 86% (291/337) [added 34% (116/337)]
no-filler 22% (286/1321) [added 71% (112/158)]
read-back median 1/6
```
