# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline enumerate+gates · writer codex/gpt-6-luna medium · enumeration codex · gpt-6-luna · low · judge codex · gpt-6-luna · medium
```

- replay: 23 turns: 140 facts, 98 open, 42 closed
- facts with an anchor found in the input: 140 of 140 (100%)
- G2   1 refused  0 flagged
- G4   0 refused  5 flagged
- G8   0 refused  13 flagged
- G11  3 refused  0 flagged
- 0 items dropped after the retry
- tab-recap eval — judge codex · gpt-6-luna · medium — 23 runs sampled, 22 judged
- judge vs anchor (15)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 93% | 124/133 |
| I2 | 99% | 132/133 |
| I3 | 95% | 127/133 |
| I4 | 89% | 118/133 |
| I5 | 100% | 133/133 |
| I6 | 97% | 129/133 |
| I7 | 94% | 125/133 |
| S-goal | 0% | 0/1 |
| S-now | 73% | 8/11 |
| S-needs | 50% | 10/20 |
| S-done | 92% | 34/37 |
| S-decisions | 12% | 3/25 |
| S-next | 95% | 21/22 |
| S-rules | 75% | 3/4 |
| S-links | 85% | 11/13 |
| coverage | 83% | 236/286 |
| filler | 19% | 230/1242 |
| readback-1 | 55% | 12/22 |
| readback-2 | 32% | 7/22 |
| readback-3 | 5% | 1/22 |
| readback-4 | 68% | 15/22 |
| readback-5 | 50% | 11/22 |
| readback-6 | 9% | 2/22 |

## All judged runs (state after each run; added in brackets)

```
coverage 83% (236/286) [added 33% (95/286)]
no-filler 19% (230/1242) [added 68% (90/133)]
read-back median 2/6
```
