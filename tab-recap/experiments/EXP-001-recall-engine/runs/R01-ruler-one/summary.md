# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline one · writer codex/gpt-6-luna · judge codex · gpt-6-luna · medium
```

- replay: 23 turns: 72 facts, 51 open, 21 closed
- tab-recap eval — judge codex · gpt-6-luna · medium — 19 runs sampled, 17 judged
- judge vs anchor (0)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 81% | 50/62 |
| I2 | 100% | 62/62 |
| I3 | 94% | 58/62 |
| I4 | 84% | 52/62 |
| I5 | 100% | 62/62 |
| I6 | 94% | 58/62 |
| I7 | 92% | 57/62 |
| S-goal | 0% | 0/1 |
| S-now | 75% | 6/8 |
| S-needs | 56% | 5/9 |
| S-done | 100% | 19/19 |
| S-decisions | 0% | 0/4 |
| S-next | 67% | 8/12 |
| S-rules | 100% | 2/2 |
| S-links | 100% | 7/7 |
| coverage | 75% | 175/234 |
| filler | 33% | 168/506 |
| readback-1 | 71% | 12/17 |
| readback-2 | 18% | 3/17 |
| readback-3 | 6% | 1/17 |
| readback-4 | 29% | 5/17 |
| readback-5 | 41% | 7/17 |
| readback-6 | 18% | 3/17 |

## All judged runs (state after each run; added in brackets)

```
coverage 75% (175/234) [added 16% (38/234)]
no-filler 33% (168/506) [added 51% (32/63)]
read-back median 2/6
```
