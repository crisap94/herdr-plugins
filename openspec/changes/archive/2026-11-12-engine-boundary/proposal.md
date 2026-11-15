# Proposal: cut the engine boundary in place, with no behaviour change

## Why

tab-recap's core already names no frontend, but nothing says where the core ends. The code that turns an agent's turns into
facts in a ledger is reached from the daemon through many constructors, and a file on that path may import anything in `src/`.
A second host (a plain coding session with no herdr) needs that core as one thing it can build and call. The maintainers want
the core to become a host-independent engine (working name session-ledger), and want the boundary drawn and enforced before
anything is moved, so that nothing a host does today changes while it is drawn.

## What changes

- A new capability `engine-boundary` with three requirements: an engine file imports only engine files; the engine runs with no
  herdr; the writer's input is byte-identical before and after the cut.
- The engine of this slice is the import closure of `tab-recap/src/recap/application/recap-job.ts`: recap-job, extract,
  enumerate, the curator's input, the ledger, reconcile, the operations, the writer's context, boundaries, chunking and
  triggers, with `domain/gates`, the ports they use, `protocol/result.ts` and `i18n/sections.ts` (about 93 files).
- The cut is made in place: no file moves. A manifest, `ci/engine-files.json`, lists the engine's files, and a dependency-cruiser
  rule, `engine-self-contained`, fails when an engine file imports a file outside the manifest.
- A golden test pins the writer's input bytes and the resulting facts for a replayed fixture before anything else changes.
- `RecapCause` moves out of `domain/intent.ts` into its own file, so the fold's board and intents leave the engine's closure;
  `intent.ts` re-exports it.
- One facade, `src/recap/application/engine.ts` (`createEngine`), is the only way a host builds and calls the engine. Replay and
  the daemon are re-pointed to it.
- Four nouns join `tab-recap/CONTEXT.md`: **Engine**, **Scope**, **Followed session**, and the engine's sense of **Host**. They
  are aliases at the facade only.

## Out of scope

- The physical move of the engine to its own package, and the standalone service.
- Compaction, autocompact, handoff, and eval and its judge: later slices.
- The fold, the informer and dispatch: they stay on the host side.
- Any rename in prompts, the DTD, SQL columns or stored values: they keep saying tab and lane, byte for byte.
- The command-line host for a plain coding session (a later change).
- Any behaviour change. Every test that passes today passes after each step.

## Changelog label

`changelog::internal`
