# Design

1. `contextOf` stays in the domain and receives a kind-specific `windowOf` function.
2. The adapter table is total over `RegisteredKind`; screen-only kinds use the nullable unknown-kind path.
3. Claude's family table and model-family parsing live in the adapter layer.
4. The context-size ladder is shared behavior, so the adapter layer supplies it to the domain's generic raising function.
5. The domain keeps setting priority, peak raising, `shareOf`, and `sizeOf` without importing adapters.
6. Claude still checks the injected `ModelCatalogue` before its family table, preserving today's values; an observed window remains first.
7. The catalogue is currently backed by the OpenCode model cache, including for Claude; this cross-adapter dependency is an oddity retained for compatibility.
8. Codex prefers its observed window; its catalogue fallback remains to preserve the current result for inputs without an observed window.
9. No Node built-in fits the handwritten family lookup: it is a small domain-specific model-family rule, not a general parsing format.
