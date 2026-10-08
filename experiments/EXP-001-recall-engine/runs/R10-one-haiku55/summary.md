# Summary (numbers only; the raw output with the ledger text is on the private branch)

```
pipeline one · writer claude/claude-haiku-5-5 medium · enumeration claude · claude-haiku-5-5 · low · judge codex · gpt-6-luna · medium
```

- cost: $0.074 over 23 turns ($0.0032 per turn, as reported by the claude harness)
- calls: 26 writer + 0 enumeration (1.13 per turn)
- replay: 23 turns: 123 facts, 84 open, 39 closed
- facts with an anchor found in the input: 123 of 123 (100%)
- G2  3 refused  0 flagged
- G4  0 refused  4 flagged
- G8  0 refused  11 flagged
- 0 items dropped after the retry
- tab-recap eval — judge codex · gpt-6-luna · medium — 22 runs sampled, 21 judged
- judge vs anchor (8)

## Pass rate by check

| check | pass | n |
|---|---|---|
| I1 | 96% | 110/114 |
| I2 | 100% | 114/114 |
| I3 | 97% | 111/114 |
| I4 | 93% | 106/114 |
| I5 | 98% | 112/114 |
| I6 | 100% | 114/114 |
| I7 | 92% | 105/114 |
| S-goal | 0% | 0/1 |
| S-now | 100% | 11/11 |
| S-needs | 42% | 5/12 |
| S-done | 97% | 32/33 |
| S-decisions | 11% | 2/19 |
| S-next | 89% | 17/19 |
| S-rules | 100% | 8/8 |
| S-links | 100% | 11/11 |
| coverage | 83% | 264/318 |
| filler | 28% | 258/907 |
| readback-1 | 67% | 14/21 |
| readback-2 | 29% | 6/21 |
| readback-3 | 33% | 7/21 |
| readback-4 | 62% | 13/21 |
| readback-5 | 5% | 1/21 |
| readback-6 | 33% | 7/21 |

## All judged runs (state after each run; added in brackets)

```
coverage 83% (264/318) [added 24% (76/318)]
no-filler 28% (258/907) [added 63% (73/116)]
read-back median 3/6
```
