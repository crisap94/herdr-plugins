# Summary (numbers only; the corpus quotes real sessions and stays in the scratch directory)

- sampling frame: 306 stored turn-ended runs of Claude lanes (no error), 0 without a readable transcript; 25 tabs
- sample: 198 points (seed 42), strata taken in the order boundary, high, random:

| stratum | asked | got |
|---|---|---|
| boundary | 60 | 18 |
| high | 120 | 120 |
| random | 60 | 60 |

- shortfall: boundary 42 (only 18 turn ends precede a boundary of a stored transcript)
- share at the point: < 40: 72 · 40–79: 121 · ≥ 80: 4 · unknown: 1 (125 at or above 40; 5 of them sit in the boundary stratum)
- gate the point would get: below-soft 53 · ask 25 · in-flight 118 · ceiling 2
- hindsight: 17 points with nothing after them, 58 without a next operator prompt
- state: 26 without a goal, 22 without open work, 84 without a last prompt in the 256 KB tail

## Outcome set

- compact boundaries in Claude transcripts modified in the last 30 days: 233 (auto 137, manual 96); 225 followed by tool calls or a prompt
- re-reads (files read in the 50 calls before and read again in the 10 after): 24 boundaries with at least one; mean 0.180
- restated (first prompt after has Jaccard ≥ 0.5 with one of the 20 before): 19 boundaries
- with a stored run within 10 minutes before: 16 (0 of them outside the sample)
