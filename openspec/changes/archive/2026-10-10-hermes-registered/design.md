# Design

## Explicit capability rows

`Capability<Value, Why>` pairs a supported value with a reason type scoped to that capability. The existing `Unknown` remains the result of a read whose outcome cannot be known. Hermes receives unsupported rows for history, in-flight work, context window and compaction. Session identity is an attribute supplied for a pane, so Hermes uses the same `sessionFromAgentSession` parser as other kinds. History still yields no exact `Transcripts` reader, preserving the recap error `no reader for hermes`; the configured screen fallback remains available under the existing opt-in rule. Window lookup returns no basis for Hermes even when a window is observed. Compaction and in-flight refusal wording is derived from the capability key in one wording module.

The handwritten `Record<RegisteredKind, Capability<...>>` tables are the compiler's exhaustiveness boundary. There is no Node built-in that can express or check a closed TypeScript union against per-kind declarations. The small projection that builds reader instances uses `Object.fromEntries`, since Node has no typed registry projection built in. Setup wording is a typed key on the job harness entry and localized in the existing English and Spanish message catalogs.

## Setup behavior

Hermes remains available for recap jobs and keeps the existing backend order, model, safe-mode execution and `clarify` tool behavior. The setup choice now shows `hermes — recap only` in English and `hermes — solo resúmenes` in Spanish from the job harness registry. Backend and message catalogs share the `SetupNote` type.

## Measurement verdict

This proof is `N compiler-linked rows`, not one adapter plus one registry line. Adding a registered kind takes the registered-kind row and a row in each of five `Record<RegisteredKind, ...>` tables: history readers (`READERS`), in-flight capability (`IN_FLIGHT_CAPABILITIES`), window sources (`WINDOW_SOURCES`), compaction plans (`COMPACTION_PLANS`) and session identity (`SESSION_OF`). Before the Hermes change four of these tables were forced; the in-flight table is the new one. Session identity's value for Hermes is the shared rule, the same `sessionFromAgentSession` parser that serves the unregistered fallback, but its row is still compiler-forced. The job harness note and conformance assertions remain conventions. A future proposal could declare supported values and unsupported reasons once in the adapter and derive the consumer tables from that declaration; that refactor is intentionally not part of this proof.

## Behavior

The existing Hermes refusal pins remain unchanged: no compaction target is offered, recap jobs report `no reader for hermes`, and autocompact stops at the in-flight gate with `no transcript reader for hermes`. Deliberate behavior differences are the localized setup note, `readerKindOf('hermes')` returning `hermes`, and Hermes producing no context-window basis. Session identity remains unchanged and passes through the shared parser.

One in-flight difference is declared. The in-flight capability table answers before any screen reader is consulted. A Hermes lane with a screen reader enabled (`TAB_RECAP_SCREEN_AGENTS` and `TAB_RECAP_AUTOCOMPACT_KINDS` both listing `hermes`) therefore reports `no transcript reader for hermes`, where it reported `screen transcripts do not contain in-flight work` before this change. Without a screen reader the Hermes reason is unchanged. The in-flight reasons of Claude, Codex and OpenCode are byte-identical to before, including when a registry has no reader for them, which still reports `no transcript reader for <kind>`.
