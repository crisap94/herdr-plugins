# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline one · writer codex/gpt-6-luna · judge codex · gpt-6-luna · medium
```

- replay: 23 turns: 71 facts, 54 open, 17 closed
- tab-recap eval — judge codex · gpt-6-luna · medium — 19 runs sampled, 18 judged
- judge vs anchor (7)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 88% | 58/66 |
| I2 | 100% | 66/66 |
| I3 | 97% | 64/66 |
| I4 | 89% | 59/66 |
| I5 | 100% | 66/66 |
| I6 | 98% | 65/66 |
| I7 | 94% | 62/66 |
| S-goal | 100% | 1/1 |
| S-now | 80% | 8/10 |
| S-needs | 71% | 10/14 |
| S-done | 94% | 17/18 |
| S-decisions | 20% | 1/5 |
| S-next | 80% | 8/10 |
| S-rules | 100% | 2/2 |
| S-links | 100% | 6/6 |
| coverage | 84% | 201/239 |
| filler | 36% | 196/546 |
| readback-1 | 78% | 14/18 |
| readback-2 | 28% | 5/18 |
| readback-3 | 22% | 4/18 |
| readback-4 | 50% | 9/18 |
| readback-5 | 0% | 0/18 |
| readback-6 | 17% | 3/18 |

## All judged runs (state after each run; added in brackets)

```
coverage 84% (201/239) [added 18% (42/239)]
no-filler 36% (196/546) [added 59% (39/66)]
read-back median 2/6
```
