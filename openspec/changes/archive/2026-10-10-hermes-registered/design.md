# Design

## Explicit capability rows

`Capability<Value, Why>` pairs a supported value with a reason type scoped to that capability. The existing `Unknown` remains the result of a read whose outcome cannot be known. Hermes receives unsupported rows for history, in-flight work, context window and compaction. Session identity is an attribute supplied for a pane, so Hermes uses the same `sessionFromAgentSession` parser as other kinds. History still yields no exact `Transcripts` reader, preserving the recap error `no reader for hermes`; the configured screen fallback remains available under the existing opt-in rule. Window lookup returns no basis for Hermes even when a window is observed. Compaction and in-flight refusal wording is derived from the capability key in one wording module.

The handwritten `Record<RegisteredKind, Capability<...>>` tables are the compiler's exhaustiveness boundary. There is no Node built-in that can express or check a closed TypeScript union against per-kind declarations. The small projection that builds reader instances uses `Object.fromEntries`, since Node has no typed registry projection built in. Setup wording is a typed key on the job harness entry and localized in the existing English and Spanish message catalogs.

## Setup behavior

Hermes remains available for recap jobs and keeps the existing backend order, model, safe-mode execution and `clarify` tool behavior. The setup choice now shows `hermes — recap only` in English and `hermes — solo resúmenes` in Spanish from the job harness registry. Backend and message catalogs share the `SetupNote` type.

## Measurement verdict

This proof is `N compiler-linked rows`, not one adapter plus one registry line. The registered-kind row, transcript capability, in-flight capability, window source and compaction plan are separate edits; session identity is a supported shared rule. The compiler forces a row in each `Record<RegisteredKind, ...>` table. The job harness note and conformance assertions remain conventions. A future proposal could declare supported values and unsupported reasons once in the adapter and derive the consumer tables from that declaration; that refactor is intentionally not part of this proof.

## Behavior

The existing Hermes refusal pins remain unchanged: no compaction target is offered, recap jobs report `no reader for hermes`, and autocompact stops at the in-flight gate with `no transcript reader for hermes`. Deliberate behavior differences are the localized setup note, `readerKindOf('hermes')` returning `hermes`, and Hermes producing no context-window basis. Session identity remains unchanged and passes through the shared parser.
