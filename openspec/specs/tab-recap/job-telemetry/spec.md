# tab-recap/job-telemetry Specification

## Purpose
Give supported harness child processes a constant, privacy-safe OpenTelemetry resource attribute so their telemetry can be distinguished from interactive sessions.

## Requirements

### Requirement: Job tags use a closed set of constant values

The plugin SHALL define a closed `JOB_TAGS as const` tuple and derive `JobTag` from it. Its six values SHALL map to configured Jobs as described in the scenarios. The serializer SHALL reject values outside the tuple. Only the constant `tab_recap.job` attribute SHALL be added; it SHALL contain no session content.

#### Scenario: Every Job tag is mapped to its harness calls

- **WHEN** telemetry tagging is enabled for a supported child harness built from configuration
- **THEN** recap writer and enumerator calls SHALL use `recap-writer`, both curator modes SHALL use `curator`, judge calls SHALL use `judge`, brief calls SHALL use `compaction-brief`, automatic decision calls SHALL use `decider`, and harness-backed brief coverage calls SHALL use `coverage-check`

#### Scenario: A value is outside the closed set

- **WHEN** typed code supplies an unknown literal or untyped code supplies a value rejected by `isJobTag`
- **THEN** the compile-time check or runtime guard SHALL reject the value before serialization

#### Scenario: Job attributes contain no session content

- **WHEN** a job launches with a prompt, title, identifier, path, model, and operator-specific context
- **THEN** the `tab_recap.job` value SHALL remain the constant Job tag

### Requirement: Telemetry tagging is opt-in and visible in setup

`TAB_RECAP_TELEMETRY_TAGS` SHALL accept `on` or `off` and default to `off`. When off, the child environment SHALL be byte-identical to the environment the launch built before this setting existed, including any inherited `OTEL_RESOURCE_ATTRIBUTES`. When on, the plugin SHALL add a tag only to Claude and Codex child harnesses. The setting SHALL be available as an on/off row in the setup modal; an environment-locked value SHALL lock the row and SHALL NOT be overwritten by a save.

#### Scenario: The setting is absent or off

- **WHEN** a harness child is built with `TAB_RECAP_TELEMETRY_TAGS` absent or set to `off`
- **THEN** its child environment SHALL remain byte-identical to today's environment and SHALL contain no added Job tag

#### Scenario: The setup row is edited or locked

- **WHEN** a user opens setup with telemetry tags configured as `on` or `off`
- **THEN** the setup row SHALL show that value and allow changing it when the setting is not environment-locked
- **AND** a value locked by the environment SHALL NOT be written over by setup saving

### Requirement: The process adapter merges encoded job attributes without rewriting inherited entries

The plugin SHALL serialize its closed `JobAttributes` record, merge the `tab_recap.job` entry into inherited resource attributes, preserve unrelated entries byte-for-byte, and leave the parent environment unchanged. If serialization throws `TypeError`, the error SHALL be logged once and the job SHALL run untagged.

#### Scenario: The inherited variable is empty

- **WHEN** tagging is on and inherited `OTEL_RESOURCE_ATTRIBUTES` is empty or absent
- **THEN** the child variable SHALL contain only the serialized Job tag

#### Scenario: The inherited variable has stray commas

- **WHEN** tagging is on and inherited resource attributes contain empty entries from leading, repeated, or trailing commas
- **THEN** empty entries SHALL be discarded and all non-empty unrelated entries SHALL be preserved

#### Scenario: An inherited value contains another equals sign

- **WHEN** an inherited entry contains more than one equals sign in its value
- **THEN** the key SHALL be read only up to the first equals sign and the full non-colliding entry SHALL remain byte-for-byte unchanged

#### Scenario: An inherited entry is malformed

- **WHEN** an inherited non-empty entry has no equals sign or has an empty key
- **THEN** the entry SHALL be preserved as opaque text and the Job tag SHALL still be appended

#### Scenario: The inherited key collides with the Job tag after trimming

- **WHEN** an inherited entry is ` tab_recap.job=x`
- **THEN** the padded-key collision SHALL be removed, unrelated entries SHALL remain byte-for-byte unchanged, and the actual Job tag SHALL be appended

### Requirement: Supported child harnesses receive tags through their supported mechanisms

Claude and Codex children SHALL receive the serialized Job tag when enabled. The README SHALL document their separate environment and exporter configuration. Remote deciders, OpenCode, Hermes, and custom harnesses SHALL remain untagged.

#### Scenario: A Claude child is built with telemetry enabled

- **WHEN** the supported Claude child is built with tagging on
- **THEN** the child environment SHALL contain the merged `OTEL_RESOURCE_ATTRIBUTES` value with the Job tag
- **AND** the README SHALL identify daemon process environment variables as the supported path for Claude telemetry configuration

#### Scenario: A Codex child is built with telemetry enabled

- **WHEN** a supported Codex child is built with tagging on
- **THEN** its child environment SHALL contain the merged `OTEL_RESOURCE_ATTRIBUTES` value with the Job tag
- **AND** the README SHALL describe the Codex exporter configuration locations and daemon environment variables it relies on

#### Scenario: A remote decider does not launch a harness child

- **WHEN** a decider or brief coverage check uses a remote HTTP service
- **THEN** it SHALL remain untagged because it launches no child harness

#### Scenario: A custom command inherits resource attributes

- **WHEN** a custom harness is launched with tagging enabled
- **THEN** it SHALL receive the daemon's `OTEL_RESOURCE_ATTRIBUTES` unchanged and SHALL receive no plugin Job tag

#### Scenario: A harness without a verified mechanism is used

- **WHEN** a job launches through OpenCode or Hermes with tagging enabled
- **THEN** its environment and invocation SHALL remain unchanged and it SHALL receive no plugin Job tag

### Requirement: Claude telemetry queries are documented

The README SHALL document illustrative Claude queries, collector label behavior, and how to distinguish tagged from untagged series. It SHALL identify exporter-dependent metric names and explain the failure mode when resource attributes are not promoted.

#### Scenario: Claude telemetry is queried in a time range

- **WHEN** a collector promotes `tab_recap.job` or exposes it through its resource-info metric
- **THEN** the README's illustrative Claude counter queries SHALL use `increase` over a stated range and group cost and token counts by the Job tag

#### Scenario: The collector does not promote the resource attribute

- **WHEN** a query looks for an empty `tab_recap_job` label but the collector has not promoted that resource attribute
- **THEN** the documentation SHALL warn that the whole fleet may match the untagged query and SHALL show an illustrative resource-info join with `group_left(tab_recap_job)`

### Requirement: Codex telemetry queries account for metric temporality

The README SHALL document Codex token queries that match the stated temporality and collector conversion, plus an illustrative fallback based on entry-point labels. It SHALL explain the limits of those labels and that disabled tags are absent.

#### Scenario: Codex metrics preconditions are documented

- **WHEN** the README describes Codex OTel metrics
- **THEN** it SHALL state that exported metrics require analytics enabled and an OTLP metrics exporter table
- **AND** it SHALL state that without that exporter metrics go to a vendor analytics endpoint
- **AND** it SHALL disclose that a configured Codex OTel exporter also sends a turn-id-only request with no content to the model provider

#### Scenario: Codex telemetry is queried with the documented temporality

- **WHEN** Codex token metrics are queried from a collector that promotes resource attributes
- **THEN** the illustrative query SHALL group the histogram series by Job tag, model, and token type and SHALL be correct for the temporality and conversion the README documents

#### Scenario: Codex uses fallback labels

- **WHEN** the Job tag is absent and a dashboard filters on Codex entry-point attributes
- **THEN** the query SHALL use the default translated label `job="codex_exec"` with `originator` and `session_source`, and SHALL NOT imply that these alone identify plugin jobs

### Requirement: Codex cost documentation states assumptions

The README SHALL document the illustrative Codex cost formula, identify its unverified token overlap assumptions, require verification before publication, exclude `total`, and use an external price table. The plugin SHALL NOT ship a price table or cost metric.

#### Scenario: Cost estimate is prepared

- **WHEN** an operator prepares a Codex cost estimate
- **THEN** the README SHALL state the overlap assumptions, require verification before publishing, exclude `total` from component counts, and identify the external price table
