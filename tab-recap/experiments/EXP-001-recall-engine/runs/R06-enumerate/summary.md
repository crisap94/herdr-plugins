# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline enumerate · writer codex/gpt-6-luna medium · enumeration codex · gpt-6-luna · low · judge codex · gpt-6-luna · medium
```

- replay: 23 turns: 114 facts, 78 open, 36 closed
- facts with an anchor found in the input: 114 of 114 (100%)
- G2  2 refused  0 flagged
- G3  3 refused  0 flagged
- G4  0 refused  3 flagged
- G8  0 refused  6 flagged
- 0 items dropped after the retry
- tab-recap eval — judge codex · gpt-6-luna · medium — 22 runs sampled, 22 judged
- judge vs anchor (6)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 92% | 103/112 |
| I2 | 98% | 110/112 |
| I3 | 91% | 102/112 |
| I4 | 95% | 106/112 |
| I5 | 100% | 112/112 |
| I6 | 96% | 108/112 |
| I7 | 98% | 110/112 |
| S-goal | 67% | 2/3 |
| S-now | 88% | 7/8 |
| S-needs | 55% | 11/20 |
| S-done | 100% | 37/37 |
| S-decisions | 38% | 6/16 |
| S-next | 83% | 15/18 |
| S-rules | 100% | 4/4 |
| S-links | 100% | 6/6 |
| coverage | 70% | 198/281 |
| filler | 21% | 188/904 |
| readback-1 | 50% | 11/22 |
| readback-2 | 41% | 9/22 |
| readback-3 | 18% | 4/22 |
| readback-4 | 50% | 11/22 |
| readback-5 | 5% | 1/22 |
| readback-6 | 0% | 0/22 |

## All judged runs (state after each run; added in brackets)

```
coverage 70% (198/281) [added 29% (81/281)]
no-filler 21% (188/904) [added 68% (77/114)]
read-back median 1.5/6
```
