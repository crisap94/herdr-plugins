# Compaction timing — vocabulary

Sub-context "Compaction timing" of the session ledger, export `./compaction-timing`: when a followed session may be compacted. `contract.ts` uses these terms. It reaches the rest of the engine only through `engine-port.ts`, which re-exports exactly nineteen names of `src/contract/`, so the sub-context can be split out later. Where a term has no own entry here, the vocabulary of [the package](../../CONTEXT.md) applies.

| Term | Meaning |
|---|---|
| Candidate | A followed session offered for consideration |
| Context use | Tokens over window; share is the percentage |
| Policy / Tuning | Thresholds and style |
| Gate | The cheap rule that stops or lets through |
| Flight | Work that holds a session |
| Verdict | `compact`, `wait`, `undecided` or `unknown` |
| Decision | A recorded verdict |
| Skip | A recorded gate stop |
| Safe point | A Decision with verdict `compact` and effect `may-act` in mode `on` |
| Ask | The returned instruction to compact |
| Brief | The text that survives compaction |
| Coverage | The check that the Brief keeps the open facts |
| Sweep | The periodic pass |
| Accomplishment | A fact just established, received from the ledger |
