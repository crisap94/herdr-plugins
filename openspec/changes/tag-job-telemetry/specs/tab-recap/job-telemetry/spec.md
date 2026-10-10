## Purpose

Give supported headless jobs a constant, privacy-safe OpenTelemetry resource attribute so their telemetry can be separated from interactive sessions.

## ADDED Requirements

### Requirement: Job telemetry uses a closed, constant job attribute

When enabled, each job SHALL be identified by the resource attribute `tab_recap.job` with one of the closed values `recap-writer`, `curator`, `decider`, `judge`, `compaction-brief`, or `coverage-check`. The attribute SHALL contain no prompt content, tab or lane title or identifier, path, model, or operator-specific value. A typed serializer SHALL reject any value outside the closed job union.

#### Scenario: Each registered job kind is tagged

- **WHEN** telemetry tags are enabled and any one of the recap-writer, curator, decider, judge, compaction-brief, or coverage-check jobs is launched through a supported harness
- **THEN** its resource SHALL contain `tab_recap.job` with that job's corresponding closed value

#### Scenario: A value outside the job union is supplied

- **WHEN** a caller attempts to construct a job attribute with a value outside the closed job union
- **THEN** the typed interface SHALL reject the value before serialization

#### Scenario: Job attributes contain no session content

- **WHEN** a job launches with a prompt, title, identifier, path, model, and operator-specific context
- **THEN** the serialized job attribute SHALL contain only the constant job kind

### Requirement: Job telemetry tagging is opt-in and preserves the disabled environment

`TAB_RECAP_TELEMETRY_TAGS` SHALL accept `on` or `off` and default to `off`. When off, the child environment SHALL be byte-identical to the environment the job launch builds without this setting, including an existing `OTEL_RESOURCE_ATTRIBUTES` value.

#### Scenario: The setting is absent or off

- **WHEN** a job is launched with `TAB_RECAP_TELEMETRY_TAGS` absent or set to `off`
- **THEN** its child environment SHALL remain byte-identical to today's environment and SHALL have no added job attribute

#### Scenario: The setting is on

- **WHEN** a job is launched with `TAB_RECAP_TELEMETRY_TAGS=on`
- **THEN** supported harness adapters SHALL add the constant job attribute while building the child environment

### Requirement: Resource attributes are encoded and merged deterministically

When enabled, the serializer SHALL produce comma-separated `key=value` resource attributes and percent-encode attribute values. The adapter SHALL preserve existing well-formed `OTEL_RESOURCE_ATTRIBUTES` entries other than an existing `tab_recap.job`; the plugin's job value SHALL win if that key already exists. The adapter SHALL not mutate the parent environment.

#### Scenario: The child environment already exports resource attributes

- **WHEN** tagging is on and the parent environment contains other well-formed resource attributes and a `tab_recap.job` value
- **THEN** the child resource attributes SHALL preserve the other entries and replace the colliding job value with the actual job kind

#### Scenario: An attribute value needs percent-encoding

- **WHEN** a supported serializer encodes a job attribute value
- **THEN** it SHALL percent-encode the value using the Node built-in `encodeURIComponent`

### Requirement: Only verified harness mechanisms receive job attributes

Claude and Codex adapters SHALL pass the serialized resource attribute through `OTEL_RESOURCE_ATTRIBUTES` when tagging is on. Codex 0.162.1 SHALL expose that attribute on log and metric resources when those signals are emitted. Metrics require the Codex OpenTelemetry metrics exporter to be configured and its metrics path enabled. OpenCode, Hermes, and custom adapters SHALL remain untagged unless a resource-attribute mechanism is verified, and enabling the setting SHALL NOT change their job behavior.

#### Scenario: Claude launches a tagged job

- **WHEN** tagging is on and a supported job launches through Claude
- **THEN** the Claude child environment SHALL contain the merged `OTEL_RESOURCE_ATTRIBUTES` value with the job attribute

#### Scenario: Codex launches a tagged job

- **WHEN** tagging is on and a supported job launches through Codex with OTel logs or metrics configured
- **THEN** emitted log and metric resources SHALL carry the job attribute
- **AND** `service.name` SHALL remain determined by the Codex entry point

#### Scenario: Codex metrics are not configured

- **WHEN** tagging is on but Codex has no configured OTel metrics exporter or its metrics path is disabled
- **THEN** the plugin SHALL not claim that job metrics are emitted

#### Scenario: A harness has no verified resource-attribute mechanism

- **WHEN** tagging is on and a job launches through OpenCode, Hermes, or a custom harness without a verified mechanism
- **THEN** its environment and invocation SHALL remain unchanged and no job tag SHALL be claimed

### Requirement: Dashboards can separate tagged and untagged work

Documentation SHALL explain that a collector may promote resource attributes to metric labels or make them available by joining to its resource info metric. It SHALL give illustrative Prometheus-style queries for Claude cost and token metrics grouped by `tab_recap.job`, a query for tagged work and for work where that attribute is absent, and a Codex token query grouped by job, model, and token type. It SHALL state that the series are untagged and recap work cannot be separated by this attribute when the setting is off.

Codex cost SHALL be described as derived from `codex.turn.token_usage` token counts by `token_type` and `model`, multiplied by a per-model price table maintained by the operator. The `total` token type SHALL NOT be added to component types. Documentation SHALL explain that cached-input and reasoning-output rates and overlap must be handled by the external price table, and that the plugin ships no price table or cost metric. Codex OTel metrics configuration SHALL be named as a precondition.

#### Scenario: Claude metrics are queried by job kind

- **WHEN** a collector promotes `tab_recap.job` to a metric label
- **THEN** the documented illustrative queries SHALL group `claude_code.cost.usage` and `claude_code.token.usage` by the job label and distinguish tagged recap work from series with the label absent

#### Scenario: Codex token usage is queried by job kind

- **WHEN** a collector promotes `tab_recap.job` to a metric label and Codex metrics are configured
- **THEN** the documented illustrative query SHALL group `codex.turn.token_usage` by job, model, and token type and SHALL explain how an operator-maintained price table derives cost

#### Scenario: The setting is off

- **WHEN** a dashboard queries Claude or Codex telemetry from jobs launched while tagging is off
- **THEN** those series SHALL have no `tab_recap.job` label and SHALL not distinguish recap jobs from other sessions
