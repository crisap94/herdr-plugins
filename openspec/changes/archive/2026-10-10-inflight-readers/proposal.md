# Proposal

## Why

Autocompact can currently mistake an open call or tool part for live work forever, while Codex and opencode readers do not report in-flight work. Reader capability is also implicit, so the gate cannot distinguish an unsupported reader from a missing reader.

## What Changes

- Add typed in-flight capabilities to the registered transcript readers and implement bounded Codex rollout and opencode database readers.
- Make unsupported and unregistered reader reasons explicit in the autocompact gate.
- Add opt-in shadow kinds that store full decisions with mode `shadow` and never request compaction.

## Out of scope

- Enabling Codex or opencode for automatic compaction by default.
- Process-table liveness checks, transcript decoding changes, and live-harness observations.
- Changes to Claude's in-flight counting behavior.

## Changelog

This feature carries the `changelog::added` merge request label.
