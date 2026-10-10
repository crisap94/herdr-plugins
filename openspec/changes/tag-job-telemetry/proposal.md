# Proposal

## Why

Headless jobs launched by tab-recap use the same harnesses as interactive sessions. Their telemetry is difficult to distinguish when an observability stack exports OpenTelemetry. A closed, generic job attribute lets a collector separate plugin jobs without putting prompt or session data into telemetry.

## What Changes

- Add an opt-in `TAB_RECAP_TELEMETRY_TAGS` setting, defaulting to `off`.
- When enabled, tag supported child jobs with the constant resource attribute `tab_recap.job`, whose value is one of `recap-writer`, `curator`, `decider`, `judge`, `compaction-brief`, or `coverage-check`.
- Add a new job-kind tuple and pass its typed value through the harness maker to child-environment construction.
- Document collector-dependent dashboard queries and the limits of deriving Codex cost from token metrics.

## Out of scope

- Implementing code, changing launch behavior, or enabling tagging by default.
- Tagging remote HTTP-backed decisions, OpenCode, Hermes, or a custom harness command.
- Adding telemetry exporters, configuring a collector, or changing harness-specific telemetry settings.
- Shipping a token price table or a Codex cost metric.
- Adding prompts, lane or tab titles or identifiers, paths, model names, or other session-specific values to attributes.
- Updating `CHANGELOG.md` or version fields.

## Dependencies

This change builds on the job harness registry, which has landed. If a later adapter refactor changes the `Harness` port or `scrubbedEnv`, implementation rebases onto that refactor. The scope of T7 is unconfirmed, and this change does not depend on an assumed T7 launch relocation. The hook is in the `Harness` port, the five entries of `src/daemon/harness-makers.ts`, and the child environment built through `scrubbedEnv` in `src/adapters/process.ts`. This change is specification only.

## Impact

- Specifications: `job-telemetry` and a port-level addition to `harness-adapters`.
- Implementation will update the setting parser, example environment file, setup modal, documentation, harness makers, and child environment construction.

## Changelog

This specification merge request carries `changelog::internal`. The implementation merge request will most likely carry `changelog::added` because it introduces an operator-facing setting and setup row.
