# Proposal

## Why

Transcript readers are assembled independently in the daemon, expanded modal and replay command. Six application paths also repeat the same exact-kind lookup followed by a screen-reader fallback. A single typed registry makes reader selection consistent and gives each entry point an explicit reader set.

## What Changes

- Add one transcript registry for Claude, Codex and OpenCode, with an optional screen fallback.
- Route daemon, modal and replay reader selection through the registry while preserving each entry point's current reader set.
- Route transcript lookup through the registry, including an exact lookup for autocompact that preserves its current no-fallback behavior.

## Out of scope

- Deriving eligibility and policy lists from the registry.
- Changing transcript behavior, compaction behavior or supported readers.
- Changing files under `compaction*.ts`.

## Changelog

The merge request carries the label `changelog::internal`.
