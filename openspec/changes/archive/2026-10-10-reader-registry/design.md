# Design

The adapter registry table is the single source for reader construction, the closed `ReaderKind` union and its edge parser. The port's `TranscriptRegistry` is keyed by strings and owns the lookup contract without importing adapters. `readerFor` resolves a registered kind and then the configured fallback; `exact` resolves only registered kinds. The daemon registry includes the screen reader, the modal registry omits it, and replay registers Claude and Codex only. Application consumers accept a registry, and tests inject fakes with a helper that builds one.

The registry entries are assembled in one adapter module. No Node built-in provides a typed keyed lookup with these fallback modes, so the small registry class remains hand-written.

The change preserves the existing unknown-kind behavior and keeps autocompact's exact lookup. It does not alter context windows, eligible kinds or compaction.
