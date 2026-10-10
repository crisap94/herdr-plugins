## Why

The typed adapter tables represent transcript readers, context windows, session identities and compaction plans, but Hermes is already an available job harness with none of those capabilities. It cannot be registered without adding misleading behavior or leaving those capabilities absent from the type system.

## What Changes

- Add Hermes to registered kinds with explicit unsupported capabilities for history, in-flight work, context windows and compaction; session identity keeps the shared parser.
- Declare an in-flight difference for Hermes: a registered kind whose in-flight capability is unsupported answers from the capability table before any screen reader is consulted. A Hermes lane with a screen reader enabled (`TAB_RECAP_SCREEN_AGENTS` and `TAB_RECAP_AUTOCOMPACT_KINDS` both listing `hermes`) now reports `no transcript reader for hermes`, where it reported `screen transcripts do not contain in-flight work`.
- Keep the in-flight reasons of Claude, Codex and OpenCode byte-identical to before, including when a registry has no reader for them (`no transcript reader for <kind>`).
- Show the Hermes job-only capability in setup using the job harness registry.
- Make `readerKindOf('hermes')` return `hermes` as part of registered-kind lookup.
- Return no context-window basis for Hermes even when a window is reported; other unregistered kinds keep their existing lookup behavior.
- Pin the capability lookups, the Spanish setup note and the existing Hermes refusal behavior in tests.

## Out of scope

- Adding a Hermes transcript reader, context-window source, in-flight reader or compaction plan.
- Changing Hermes job execution, safe mode or its `clarify` tool.
- Any harness other than Hermes or the ast-grep rule planned separately.

## Changelog

The setup output gains a user-visible harness capability note, so this change carries the `changelog::added` merge request label.
