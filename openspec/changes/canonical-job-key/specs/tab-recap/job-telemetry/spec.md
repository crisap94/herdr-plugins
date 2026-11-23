## MODIFIED Requirements

### Requirement: Job tags use a closed set of constant values

The plugin SHALL define a closed `JOB_TAGS as const` tuple and derive `JobTag` from it. Its six values SHALL map to configured Jobs as described in the scenarios. The serializer SHALL reject values outside the tuple. Only the constant `harness.job` attribute SHALL be added; it SHALL contain no session content.

#### Scenario: Every Job tag is mapped to its harness calls

- **WHEN** telemetry tagging is enabled for a supported child harness built from configuration
- **THEN** recap writer and enumerator calls SHALL use `recap-writer`, both curator modes SHALL use `curator`, judge calls SHALL use `judge`, brief calls SHALL use `compaction-brief`, automatic decision calls SHALL use `decider`, and harness-backed brief coverage calls SHALL use `coverage-check`

#### Scenario: A value is outside the closed set

- **WHEN** typed code supplies an unknown literal or untyped code supplies a value rejected by `isJobTag`
- **THEN** the compile-time check or runtime guard SHALL reject the value before serialization

#### Scenario: Job attributes contain no session content

- **WHEN** a job launches with a prompt, title, identifier, path, model, and operator-specific context
- **THEN** the `harness.job` value SHALL remain the constant Job tag

### Requirement: The process adapter merges encoded job attributes without rewriting inherited entries

The plugin SHALL serialize its closed `JobAttributes` record, merge the `harness.job` entry into inherited resource attributes, preserve unrelated entries byte-for-byte, and leave the parent environment unchanged. If serialization throws `TypeError`, the error SHALL be logged once and the job SHALL run untagged.

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

- **WHEN** an inherited entry is ` harness.job=x`
- **THEN** the padded-key collision SHALL be removed, unrelated entries SHALL remain byte-for-byte unchanged, and the actual Job tag SHALL be appended

### Requirement: Claude telemetry queries are documented

The README SHALL document illustrative Claude queries, collector label behavior, and how to distinguish tagged from untagged series. It SHALL identify exporter-dependent metric names and explain the failure mode when resource attributes are not promoted.

#### Scenario: Claude telemetry is queried in a time range

- **WHEN** a collector promotes `harness.job` or exposes it through its resource-info metric
- **THEN** the README's illustrative Claude counter queries SHALL use `increase` over a stated range and group cost and token counts by the Job tag

#### Scenario: The collector does not promote the resource attribute

- **WHEN** a query looks for an empty `harness_job` label but the collector has not promoted that resource attribute
- **THEN** the documentation SHALL warn that the whole fleet may match the untagged query and SHALL show an illustrative resource-info join with `group_left(harness_job)`
