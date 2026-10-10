## Purpose

Give supported harness child processes a constant, privacy-safe OpenTelemetry resource attribute so their telemetry can be distinguished from interactive sessions.

## ADDED Requirements

### Requirement: Job tags use a closed set of constant kinds

The plugin SHALL define a new `JOB_KINDS` `as const` tuple and derive the `JobKind` type from it. The tuple SHALL contain exactly `recap-writer`, `curator`, `decider`, `judge`, `compaction-brief`, and `coverage-check`. These are new identifiers, not members of the harness registry. The `recap-writer` kind SHALL cover both `RecapWriter` and the separate `HarnessEnumerator` call, including enumeration in `bin/replay.ts`. The `curator` kind SHALL cover both story and reconcile modes. Harness-based decider and coverage-check calls SHALL receive their kind when the shared `HarnessDecider` is constructed. Remote HTTP-backed decider calls launch no child harness and SHALL remain untagged.

When enabled, the plugin SHALL add only the constant resource attribute `tab_recap.job=<job>`. No prompt content, tab or lane title or identifier, path, model, or operator-specific value SHALL be used. The serializer SHALL reject values outside the closed union with a runtime guard for untyped input; a compile-time test SHALL prove invalid literals are rejected.

#### Scenario: Every job kind is mapped to its harness calls

- **WHEN** telemetry tagging is enabled for a supported child harness built from configuration
- **THEN** recap writer and enumerator calls SHALL use `recap-writer`, both curator modes SHALL use `curator`, judge calls SHALL use `judge`, brief calls SHALL use `compaction-brief`, automatic decision calls SHALL use `decider`, and harness-backed brief coverage calls SHALL use `coverage-check`

#### Scenario: A value is outside the closed union

- **WHEN** typed code supplies an unknown literal or untyped code supplies a value rejected by `isJobKind`
- **THEN** the compile-time check or runtime guard SHALL reject the value before serialization

#### Scenario: Job attributes contain no session content

- **WHEN** a job launches with a prompt, title, identifier, path, model, and operator-specific context
- **THEN** the `tab_recap.job` value SHALL remain the constant job kind

### Requirement: Telemetry tagging is opt-in and visible in setup

`TAB_RECAP_TELEMETRY_TAGS` SHALL accept `on` or `off` and default to `off`. When off, the child environment SHALL be byte-identical to the environment the launch built before this setting existed, including any inherited `OTEL_RESOURCE_ATTRIBUTES`. When on, the plugin SHALL add a tag only to Claude and Codex child harnesses. The setting SHALL be available as an on/off row in the setup modal; an environment-locked value SHALL lock the row and SHALL NOT be overwritten by a save.

#### Scenario: The setting is absent or off

- **WHEN** a harness child is built with `TAB_RECAP_TELEMETRY_TAGS` absent or set to `off`
- **THEN** its child environment SHALL remain byte-identical to today's environment and SHALL contain no added job tag

#### Scenario: The setup row is edited or locked

- **WHEN** a user opens setup with telemetry tags configured as `on` or `off`
- **THEN** the setup row SHALL show that value and allow changing it when the setting is not environment-locked
- **AND** a value locked by the environment SHALL not be written over by setup saving

### Requirement: The process adapter merges encoded job attributes without rewriting inherited entries

The plugin SHALL represent attributes it owns as a closed `JobAttributes` record with the single constant key `tab_recap.job`. Its serializer SHALL percent-encode values; all `JobKind` members are percent-safe `[a-z-]` values, and a test SHALL assert that encoding each member preserves it. A single named merge parser SHALL treat inherited `OTEL_RESOURCE_ATTRIBUTES` entries as opaque, already-encoded text: split entries on commas, discard empty entries, identify a key only when an equals sign exists by taking the bytes before the first equals sign, drop entries whose key is exactly `tab_recap.job`, preserve every other entry byte-for-byte and in order, then append the plugin's serialized attribute. It SHALL not decode or re-encode inherited entries. The plugin value SHALL win on a key collision. Entries with no equals sign and entries with an empty key SHALL otherwise be left untouched. The parent process environment SHALL not be mutated.

#### Scenario: The inherited variable is empty

- **WHEN** tagging is on and inherited `OTEL_RESOURCE_ATTRIBUTES` is empty or absent
- **THEN** the child variable SHALL contain only the serialized job attribute

#### Scenario: The inherited variable has stray commas

- **WHEN** tagging is on and inherited resource attributes contain empty entries from leading, repeated, or trailing commas
- **THEN** empty entries SHALL be discarded and all non-empty unrelated entries SHALL be preserved

#### Scenario: An inherited value contains another equals sign

- **WHEN** an inherited entry contains more than one equals sign in its value
- **THEN** the key SHALL be read only up to the first equals sign and the full non-colliding entry SHALL remain byte-for-byte unchanged

#### Scenario: An inherited entry is malformed

- **WHEN** an inherited non-empty entry has no equals sign or has an empty key
- **THEN** the entry SHALL be preserved as opaque text and the job attribute SHALL still be appended

#### Scenario: The inherited key collides with the job key

- **WHEN** an inherited entry has the exact key `tab_recap.job`
- **THEN** that entry SHALL be removed and the actual job kind SHALL be appended

### Requirement: Only supported child harnesses receive job tags

For Claude and Codex, the plugin SHALL put the serialized job attribute in `OTEL_RESOURCE_ATTRIBUTES` when tagging is enabled. Claude job telemetry requires the `OTEL_*` and Claude telemetry-enable variables to be present in the daemon process environment; the harness runs with `--setting-sources ''`, and this change does not load telemetry settings from Claude setting files. This environment precondition is also required for Codex tags and exporters to be visible to the child. Remote HTTP-backed decider calls, OpenCode, and Hermes SHALL remain untagged. A custom harness SHALL pass the daemon's inherited `OTEL_RESOURCE_ATTRIBUTES` through unchanged and SHALL not receive a plugin job tag.

Codex 0.162.1's `OTEL_RESOURCE_ATTRIBUTES` behavior SHALL be described as an observation, not a plugin guarantee: with a local receiver, `tab_recap.job` was observed on both log and metric resources. The `codex.turn.token_usage` metric was observed as a histogram with delta temporality. Codex metrics require `[analytics] enabled = true` and an OTLP metrics exporter table. Without an OTLP metrics exporter, default metrics go to a vendor analytics endpoint. Any Codex OTel exporter also causes a turn-id-only request to the model provider. The Claude attribute format is described by vendor monitoring documentation and was not run in this verification.

#### Scenario: A Claude child is built with telemetry enabled

- **WHEN** the supported Claude child is built with tagging on and telemetry variables in the daemon process environment
- **THEN** the child environment SHALL contain the merged `OTEL_RESOURCE_ATTRIBUTES` value with the job tag
- **AND** the plugin SHALL not claim that variables set only in Claude setting files reach the child

#### Scenario: A Codex child is built with telemetry enabled

- **WHEN** a supported Codex child is built with tagging on
- **THEN** its child environment SHALL contain the merged `OTEL_RESOURCE_ATTRIBUTES` value with the job tag
- **AND** the design SHALL describe the observed Codex 0.162.1 behavior for logs and metrics without asserting a third-party guarantee

#### Scenario: Codex metrics are documented

- **WHEN** the README describes Codex OTel metrics
- **THEN** it SHALL state that `[analytics] enabled = true` and an OTLP metrics exporter table are required for exported metrics
- **AND** it SHALL state that without an OTLP metrics exporter metrics default to a vendor analytics endpoint
- **AND** it SHALL disclose the turn-id-only model-provider request caused by any configured Codex OTel exporter

#### Scenario: A remote decider does not launch a harness child

- **WHEN** a decider or brief coverage check uses a remote HTTP service
- **THEN** it SHALL remain untagged because it launches no child harness

#### Scenario: A custom command inherits resource attributes

- **WHEN** a custom harness is launched with tagging enabled
- **THEN** it SHALL receive the daemon's `OTEL_RESOURCE_ATTRIBUTES` unchanged and SHALL receive no plugin job tag

#### Scenario: A harness without a verified mechanism is used

- **WHEN** a job launches through OpenCode or Hermes with tagging enabled
- **THEN** its environment and invocation SHALL remain unchanged and it SHALL receive no plugin job tag

### Requirement: Documentation separates tagged and untagged telemetry honestly

`tab-recap/README.md` SHALL explain that a collector may promote resource attributes to metric labels or expose them through a resource-info metric. Metric and label names in Prometheus-style examples SHALL be identified as illustrative: dots become underscores, and unit or `_total` suffixes depend on the exporter. The README SHALL explain that if a collector does not promote `tab_recap.job`, a query matching an absent or empty label treats the whole fleet as untagged; it SHALL also provide an illustrative join using the collector's resource-info metric and `group_left(tab_recap_job)`.

The README SHALL give Claude cost and token counter queries using `increase(...[range])`, grouped by job kind, plus a tagged-versus-untagged example. Claude metric names and environment encoding behavior come from vendor monitoring documentation and were not run in this verification. The README SHALL state that when tags are off, the Claude and Codex series have no `tab_recap.job` label, so recap work cannot be separated by that attribute.

The README SHALL give a Codex query for the observed `codex.turn.token_usage` histogram with job, model, and `token_type`, state that its observed OTLP temporality was delta, and avoid assuming cumulative temporality. It SHALL give an illustrative fallback query using `service.name`, `originator`, and `session_source`, while stating that these only identify a headless entry point and cannot alone identify plugin jobs because an interactive user can also run `exec`.

The README SHALL document Codex's illustrative cost formula as the sum over models of `(input - cached_input) * p_in + cached_input * p_cached + cache_write_input * p_write + output * p_out`, with per-token prices from an externally maintained per-model table. It SHALL label the assumptions that cached input is included in input and reasoning output is billed as output and included in output; these overlaps are unverified for the observed build. If reasoning output is additive, the formula adds `reasoning_output * p_out`. Verification of these assumptions is a precondition to publishing a cost estimate. `token_type="total"` SHALL NOT be added to its component types, and the plugin SHALL NOT ship a price table or cost metric.

#### Scenario: Claude telemetry is queried in a time range

- **WHEN** a collector promotes `tab_recap.job` or exposes it through its resource-info metric
- **THEN** the README's illustrative Claude counter queries SHALL use `increase` over a stated range and group cost and token counts by the job kind

#### Scenario: The collector does not promote the resource attribute

- **WHEN** a query looks for an empty `tab_recap_job` label but the collector has not promoted that resource attribute
- **THEN** the documentation SHALL warn that the whole fleet may match the untagged query and SHALL show an illustrative resource-info join with `group_left(tab_recap_job)`

#### Scenario: Codex telemetry is queried with delta temporality

- **WHEN** Codex token metrics are queried from a collector that promotes resource attributes
- **THEN** the illustrative query SHALL group the histogram series by job, model, and token type and SHALL identify delta temporality without applying a cumulative `rate` assumption

#### Scenario: Codex uses fallback labels

- **WHEN** the job attribute is absent and a dashboard filters on Codex entry-point attributes
- **THEN** the query SHALL use illustrative `service.name`, `originator`, or `session_source` labels and SHALL not imply that these alone identify plugin jobs

#### Scenario: Tagging is off

- **WHEN** a dashboard queries Claude or Codex telemetry from jobs launched with tagging off
- **THEN** those series SHALL have no `tab_recap.job` label and SHALL not distinguish recap jobs from other sessions by job kind
