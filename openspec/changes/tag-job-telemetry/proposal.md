# Proposal

## Why

Headless jobs launched by tab-recap use the same harnesses as interactive sessions. Their telemetry is therefore difficult to distinguish when an operator exports OpenTelemetry. A closed, generic job attribute lets a collector separate plugin jobs without putting prompt or session data into telemetry.

## What Changes

- Add an opt-in setting, `TAB_RECAP_TELEMETRY_TAGS`, defaulting to `off`.
- When enabled, tag supported child jobs with the constant resource attribute `tab_recap.job`, whose value is one of `recap-writer`, `curator`, `decider`, `judge`, `compaction-brief`, or `coverage-check`.
- Specify typed job attributes and one serializer for the comma-separated `OTEL_RESOURCE_ATTRIBUTES` format, with the harness adapter applying it while building each child environment.
- Specify collector-independent dashboard queries and the Codex token-based cost derivation.
- Add the `job-telemetry` capability and extend the harness-adapters capability with the registry integration requirement.

## Out of scope

- Implementing code, changing job launch behavior, or enabling tagging by default.
- Tagging OpenCode, Hermes, or custom harness jobs without a verified resource-attribute mechanism.
- Adding telemetry exporters, configuring a collector, or changing any harness-specific telemetry settings.
- Shipping a token price table or a Codex cost metric.
- Adding prompt, lane, tab, path, model, or other session-specific values to attributes.
- Updating `CHANGELOG.md` or version fields.

## Dependencies

Implementation depends on the job harness registry (T6) and on T7, the follow-up that moves job launching behind the registry. The tag hook belongs in the registry-backed adapter method that builds a job's child environment and invocation. This change is specification only; the implementation is a later merge request after those dependencies land.

## Impact

- Specifications: `job-telemetry` and `harness-adapters`.
- Implementation tasks will update the setting parser, example environment file, setup modal, and harness adapter environment construction.
- The implementation merge request carries the `changelog::internal` label.
