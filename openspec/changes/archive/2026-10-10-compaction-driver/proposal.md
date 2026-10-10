# Proposal

## Why

The compaction sender currently chooses command, confirmation, retry, and restore behavior by checking whether a lane is `claude`. `herdr-agents.ts` separately owns the Enter delay and stalled-prompt rule. Every other kind silently receives the Codex behavior if it reaches the sender. This splits harness behavior across application and transport code and leaves an unregistered kind without an explicit capability result.

## What Changes

- Each registered kind provides a typed compaction plan from its adapter. The plan contains typed lines and pieces, duration values, stall acceptance, a confirmation sum type, retry behavior, and follow-up behavior.
- `Sender` executes a plan generically. An unregistered kind without a plan yields `Unsupported{why}`; it is never treated as Codex.
- Claude, Codex, and OpenCode retain the behavior recorded by the adapter conformance suite. Exactly one pinned oddity changes: an unregistered kind sent directly to the sender returns `Unsupported` and types nothing instead of taking the Codex plan. The adapter-conformance send test's `zed` Codex-path loop case was removed and is now a separate Unsupported assertion.
- The plan registry is type-checked against the `RegisteredKind` union derived from the registered-kinds table. A new kind requires a registered-kind table row and a matching adapter entry.

## Out of Scope

- No changes to transcript readers, in-flight readers, autocompact eligibility, job harnesses, context-window sources, or session decoding.
- No changes to conformance expectations or currently pinned oddities except the unregistered-kind case described above.
- No changes under `tab-recap/bin/`, and no code changes in this specification branch.

## Changelog

The implementation merge request will carry `changelog::internal`; it changes internal compaction architecture while preserving shipped behavior.
