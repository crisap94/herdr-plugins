# Design

The transcript port owns the closed reader-kind union, its edge parser and `TranscriptRegistry` lookup contract. `readerFor` resolves a registered kind and then the configured fallback; `exact` resolves only registered kinds. The adapter registry centralizes reader construction. The daemon registry includes the screen reader, the modal registry omits it, and replay registers Claude and Codex only. A normalization helper lets application tests continue injecting reader fakes through the same lookup API.

The registry entries are assembled in one adapter module. No Node built-in provides a typed keyed lookup with these fallback modes, so the small registry class remains hand-written.

The change preserves the existing unknown-kind behavior and keeps autocompact's exact lookup. It does not alter context windows, eligible kinds or compaction.
