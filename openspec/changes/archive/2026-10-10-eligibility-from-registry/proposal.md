# Proposal

## Why

Compaction eligibility, the default column policy and default autocompaction currently repeat kind names in separate arrays. A new reader can be registered without declaring how it participates in those behaviours.

## What Changes

- Add explicit eligibility capabilities to the domain's closed agent-kind table.
- Derive the compactable kinds, default policy kinds and default autocompact kinds from those entries while preserving current values.
- Require the transcript reader registry to cover the same kind union and parse replay's `--kind` at its input edge.
- Add tests for the current lists and capability declarations.

## Out of scope

- No compaction sending, context-window, job harness or autocompact in-flight behaviour changes.
- No changes to the pinned adapter-conformance tests.

## Changelog

This change lands on main through a merge request labelled `changelog::internal`: it changes no shipped behaviour.
