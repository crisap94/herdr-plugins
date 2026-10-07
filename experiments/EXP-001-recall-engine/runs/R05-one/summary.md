# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline one · writer codex/gpt-6-luna medium · enumeration codex · gpt-6-luna · low · judge codex · gpt-6-luna · medium
```

- replay: 23 turns: 70 facts, 49 open, 21 closed
- facts with an anchor found in the input: 70 of 70 (100%)
- G8   0 refused  4 flagged
- G11  2 refused  0 flagged
- 0 items dropped after the retry
- tab-recap eval — judge codex · gpt-6-luna · medium — 19 runs sampled, 17 judged
- judge vs anchor (8)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 83% | 50/60 |
| I2 | 100% | 60/60 |
| I3 | 98% | 59/60 |
| I4 | 87% | 52/60 |
| I5 | 98% | 59/60 |
| I6 | 100% | 60/60 |
| I7 | 95% | 57/60 |
| S-goal | 100% | 1/1 |
| S-now | 64% | 7/11 |
| S-needs | 50% | 4/8 |
| S-done | 100% | 21/21 |
| S-decisions | 0% | 0/4 |
| S-next | 100% | 7/7 |
| S-rules | 100% | 1/1 |
| S-links | 100% | 7/7 |
| coverage | 78% | 177/227 |
| filler | 34% | 171/501 |
| readback-1 | 41% | 7/17 |
| readback-2 | 35% | 6/17 |
| readback-3 | 24% | 4/17 |
| readback-4 | 0% | 0/17 |
| readback-5 | 0% | 0/17 |
| readback-6 | 18% | 3/17 |

## All judged runs (state after each run; added in brackets)

```
coverage 78% (177/227) [added 23% (52/227)]
no-filler 34% (171/501) [added 78% (47/60)]
read-back median 1/6
```
