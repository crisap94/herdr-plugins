# Design

## Decisions

### D1. Closed job identity and opt-in setting

The attribute model is a closed TypeScript union of the six job kinds in the job harness vocabulary: `recap-writer`, `curator`, `decider`, `judge`, `compaction-brief`, and `coverage-check`. The value comes from the job kind, never from a tab, lane, prompt, path, model, or harness-specific session value. No additional plugin marker is needed: the namespaced `tab_recap.job` key and its closed values already identify these jobs.

`TAB_RECAP_TELEMETRY_TAGS` accepts `on` or `off` and defaults to `off`. Off means the adapter passes the exact child environment it would pass today, without adding or rewriting `OTEL_RESOURCE_ATTRIBUTES`. The implementation adds the setting to `config.example.env` and to the setup modal as a row; a setting users cannot discover or turn on in the setup flow would make the opt-in hard to operate. The environment variable remains authoritative when it locks the row, following the existing setup setting behavior.

### D2. Typed attributes and one serializer

The job kind is represented by a closed union and the resource attributes by a typed record. One serializer handles each supported harness's `OTEL_RESOURCE_ATTRIBUTES` value; call sites provide the typed job record and do not assemble strings. A sketch of the shape is:

```typescript
type JobKind = 'recap-writer' | 'curator' | 'decider' | 'judge' | 'compaction-brief' | 'coverage-check';
type JobAttributes = Readonly<{ 'tab_recap.job': JobKind }>;

function serializeResourceAttributes(attributes: JobAttributes): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join(',');
}
```

The closed union prevents a caller from supplying an arbitrary job value. `encodeURIComponent` is the Node built-in used to percent-encode an attribute value; Node has no built-in that validates this closed record and serializes the OpenTelemetry comma-separated key/value format. The implementation must use this one serializer rather than hand-written string assembly at launch sites.

When the setting is on, the serializer's single `tab_recap.job` entry is merged with any existing `OTEL_RESOURCE_ATTRIBUTES`. Preserve every existing well-formed attribute except an existing `tab_recap.job`; the plugin's value wins for that key because it identifies the actual child job, while unrelated attributes may contain operator-provided resource context. Malformed entries are not re-emitted. The adapter merges into a copied child environment and does not mutate the parent process environment.

### D3. Harness behavior and dependency order

The registry-backed Claude and Codex adapters add the serialized attribute to the child environment when enabled. Claude Code reads `OTEL_RESOURCE_ATTRIBUTES` as comma-separated `key=value` resource attributes. Codex 0.162.1 also honors this variable; the research verified `tab_recap.job` on the resource for both logs and metrics. Codex metrics still require the operator to configure an OpenTelemetry metrics exporter and enable the CLI's metrics path; this change supplies no exporter configuration. The Codex `service.name` remains entry-point-defined (`codex_exec`, `codex-app-server`, or `codex_cli_rs`) and cannot be overridden. The resource attribute is the signal that separates a tagged job. `originator` and `session_source` can be fallback clues for a headless entry point, but do not identify plugin jobs by themselves because an interactive user can also run `exec`. `[otel] span_attributes` is not used: it tags spans, not metric or log resources.

OpenCode, Hermes, and custom adapters remain untagged because no resource-attribute mechanism is verified for them. Enabling the setting must not change their environments or job execution. Each of the six job kinds is associated with its job attribute at the registry-backed launch boundary, regardless of which supported harness runs it.

This implementation depends on T6, the typed job harness registry, and T7, the follow-up that moves job launching behind the registry. T6's archived change establishes the registry and its closed harness vocabulary. The T7 work item is described as moving launch behind that registry; no more specific T7 change document was present in the inspected T6 worktree. The hook therefore belongs in the adapter method that builds a job's child environment and invocation, after T7 makes that path registry-backed.

### D4. Collector queries and cost

Resource attributes may be promoted to metric labels by a collector, or queried by joining metric series with the resource info metric. The following Prometheus-style expressions are illustrative: the collector controls label normalization and promotion. In these examples, `tab_recap_job` is the promoted form of `tab_recap.job`.

Claude cost, separated by job:

```promql
sum by (tab_recap_job) (claude_code_cost_usage{tab_recap_job=~"recap-writer|curator|decider|judge|compaction-brief|coverage-check"})
```

Claude token usage, separated by job:

```promql
sum by (tab_recap_job, type) (claude_code_token_usage{tab_recap_job=~"recap-writer|curator|decider|judge|compaction-brief|coverage-check"})
```

For either Claude metric, tagged recap work versus all other sessions can be shown as:

```promql
sum({__name__="claude_code_cost_usage", tab_recap_job=~".+"})
sum({__name__="claude_code_cost_usage", tab_recap_job=""})
```

Codex exports no cost metric. Its `codex.turn.token_usage` metric has `token_type` and `model` attributes. An illustrative token query is:

```promql
sum by (tab_recap_job, model, token_type) (rate(codex_turn_token_usage_sum{tab_recap_job=~"recap-writer|curator|decider|judge|compaction-brief|coverage-check"}[5m]))
```

To estimate Codex cost, multiply token counts for each model and token type by a per-model price table maintained by the operator. Do not add `token_type="total"` to the component types. The price table must define how cached input and reasoning output are priced and avoid charging overlapping cached/input or reasoning/output counts twice. The plugin ships no price table; pricing and a cost metric are out of scope. Without a tagged resource, the same token query can show all Codex work by omitting the job label, but it cannot isolate recap jobs.

When tagging is off, Claude cost and token series and Codex token series remain untagged and recap work cannot be separated from other sessions using `tab_recap.job`. The setting is the opt-in to that separation for both supported harnesses.

### D5. Privacy and built-ins

Job attributes are constants determined by the six job kinds. No prompt, tab or lane title or identifier, path, model, or operator-specific value is included. The typed serializer accepts only the closed job union; it cannot serialize an arbitrary job string. When the setting is off, no attribute is added.

`encodeURIComponent` performs value percent-encoding, and Node's environment and object primitives suffice for copying and merging the child environment. No Node built-in provides a typed closed-union resource-attribute model, OpenTelemetry serializer, or a merge policy that gives the plugin's job key precedence while preserving unrelated entries. Those small typed pieces are hand-written; no runtime dependency is added.
