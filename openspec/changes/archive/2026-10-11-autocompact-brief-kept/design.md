# Design: a written brief is never thrown away

## Context

| Fact | Measured | Where |
| --- | --- | --- |
| Discarded briefs | 79 automatic compactions `skipped` with `coverage` against 41 typed, in 36 hours | `compaction` table, 2026-10-11 04:53 UTC |
| Brief calls per discard | 2 (first brief and one rewrite), writer Codex `gpt-6.1-sol` `high` | daemon log `written again`; `compaction.writer` |
| Worst lane | `w21:pB1`, 26 discards | `autocompact_decision`, gate `coverage`, verdict `wait` |
| Facts missed by a first brief | 1 to 61 | daemon log |
| Ceiling path | better brief typed, missed facts appended verbatim, at most 1 500 characters | `rememberCoverage`, `appendedBrief` in `src/recap/application/compaction*.ts` |
| Gate | `blockedByCoverage(checked, ceilingOverride)`: `missed` and `unchecked` block unless the ceiling override applies | `src/recap/application/compaction.ts` |
| Backoff default | `0` (off) | `backoffOf`, `src/recap/domain/autocompact.ts` |

## D1 — The check repairs a brief instead of vetoing it

The check exists so a compaction does not silently lose what the goal needs. Appending the missed facts verbatim
already meets that at the ceiling; the same repair below the ceiling meets it at every share, and a brief that was paid
for is typed. One flag carries it through the flow: `appends`, true when the ceiling override applies or the key is
`append`. `rememberCoverage` appends whenever `appends` is true, `bestBrief` keeps the better brief whenever `appends`
is true (it keeps the rewrite unconditionally only when the result is not typed), and `blockedByCoverage` blocks only when
`appends` is false.

`unchecked` splits by why. `decider-cannot-answer` holds a written brief: with `appends` it is typed unchanged, as an
operator's compaction is. `no-brief` and `no-decider` stay blocked below the ceiling, since nothing was spent and the
template is not an automatic brief.

## D2 — The decision record

The decision keeps the gate it was given (`ask` below the ceiling, `ceiling` at it) and verdict `compact`; its `why`
names the count of facts missed, with the same words as the ceiling line (`coverageWhy`), and the check's answers and
the appended indexes are kept as today. The amend no longer sets `block` when the brief goes ahead. The daemon log line
`autocompact ceiling: …` becomes `autocompact: …` for a lane below the ceiling.

## D3 — The key

`TAB_RECAP_AUTOCOMPACT_MISSED_FACTS`: `append` (default) or `wait`; any other value falls back to the default. `wait`
is today's rule below the ceiling. The key is read per compaction, like the ceiling override, so a change applies
without a restart. The setup modal shows it beside the ceiling override and respects an environment lock.

## Alternatives

- Turn the backoff on by default: halves the waste at best, since a working lane outgrows a 10 % window, and still
  discards every brief it writes.
- Drop the rewrite and append to the first brief: one brief call fewer per compaction, but the first brief of a long
  lane misses up to 61 facts and the 1 500-character append cannot hold them; the rewrite brought 21 down to 16 at the
  04:40 UTC compaction. Kept; to be measured again from the decision records after this ships.

## Standards

Domain first: the key is a closed union parsed once in the domain (`missedFactsOf`), the flag is a value of the flow,
no primitive crosses a new signature, no comments.
