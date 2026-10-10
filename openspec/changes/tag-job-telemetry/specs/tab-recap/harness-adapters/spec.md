## ADDED Requirements

### Requirement: Registered job adapters apply telemetry tags at the child environment boundary

The registry-backed job adapter method that builds a job's child environment and invocation SHALL accept the closed job kind and the parsed telemetry-tag setting. For Claude and Codex, when tagging is enabled, it SHALL serialize the job resource attribute into `OTEL_RESOURCE_ATTRIBUTES` using the job-telemetry requirements. The implementation SHALL depend on the job harness registry (T6) and the follow-up that moves job launching behind that registry (T7). OpenCode, Hermes, and custom adapters without a verified resource-attribute mechanism SHALL remain unchanged.

#### Scenario: A registry-backed Claude or Codex job is launched

- **WHEN** a registered Claude or Codex job is launched with telemetry tagging enabled
- **THEN** the adapter method that builds its child environment SHALL apply the resource attribute for that job kind

#### Scenario: A registry-backed job uses an unverified harness mechanism

- **WHEN** a registered OpenCode, Hermes, or custom job is launched with telemetry tagging enabled
- **THEN** its child environment and invocation SHALL remain unchanged
