# Design

## Decisions

### D1. The Job tag vocabulary

The harness registry in `recap/domain/backend.ts` lists harness ids. The existing `Job` record is the harness, model, and effort configuration; the new **Job tag** is a separate closed value set carried in `tab_recap.job`. Five tags map to configured Jobs: `recap-writer`, `curator`, `decider`, `judge`, and `compaction-brief`. `coverage-check` shares the decider Job configuration, while the enumerator shares the recap writer backend and model, with effort fixed at low. Add `src/recap/domain/job-tag.ts` with a `JOB_TAGS as const` tuple and derive `JobTag` from its members. `JobAttributes` is the closed record the plugin owns, with the single key `tab_recap.job` and a `JobTag` value.

`recap-writer` labels both the `RecapWriter` call and the separate `HarnessEnumerator` call, including the enumerator built by `bin/replay.ts`. `curator` covers both story and reconcile modes. The shared `HarnessDecider` receives `decider` or `coverage-check` at construction, depending on its caller. The judge uses `judge`; a brief uses `compaction-brief`. A remote HTTP-backed decider or coverage check launches no harness child and remains untagged.

### D2. The setting and actual launch seam

`TAB_RECAP_TELEMETRY_TAGS` accepts `on` or `off`, defaults to `off`, and controls tagging in every plugin job harness built from `loadConfig()`. This includes daemon jobs and the harness-backed writer, enumerator, and judge paths used by `bin/replay.ts` and evaluation commands. The Job tag is supplied at construction because the same concrete harness and wrapper classes serve more than one Job tag.

Today, `Harness.run(call, settings)` in `src/ports/harness.ts` has no job identity. The chosen seam carries an optional, default-off typed `JobTag` through the `Make` function and its five entries in `src/daemon/harness-makers.ts`; the `Harness` port remains unchanged. Adding the tag to the port call or settings type was considered and rejected. Each supported concrete harness uses the value while building its child environment through `scrubbedEnv()` in `src/adapters/process.ts`. With the setting off, `scrubbedEnv()` returns the same child environment as before. With it on, Claude and Codex receive the plugin-owned job attribute; OpenCode and Hermes remain unchanged. A custom command receives the daemon's inherited `OTEL_RESOURCE_ATTRIBUTES` through unchanged and receives no plugin tag.

Claude is launched with `--setting-sources ''`. The CLI help describes this as loading a comma-separated list of `user`, `project`, and `local` settings sources; this invocation names none. Whether that also suppresses `env` blocks in those setting files was not verified. Therefore Claude's `OTEL_*` and telemetry-enable variables must be present in the daemon process environment; setting this plugin key does not load them from a Claude settings file. This environment precondition is for Claude only. For Codex, the plugin supplies the tag and exporters are configured in Codex's own config under the inherited `CODEX_HOME`. Any Codex OTel environment variables the operator relies on, such as exporter headers, must be present in the daemon environment because `scrubbedEnv()` forwards them. Experiment and probe tools (`experiment-arms`, `experiment-labeller`, `autocompact-briefs`) and git children (`git-lane-repo`) stay untagged; the new `Make` parameter is optional and defaults off.

The job harness registry has landed and is archived as `job-harness-registry`. If a later adapter refactor changes the `Harness` port or `scrubbedEnv`, implementation rebases onto that refactor.

### D3. Typed serialization and opaque merge

The serializer accepts the closed plugin-owned record. The inherited value is separate opaque text, already encoded according to the exporting process's convention. A small named merge function splits on commas, drops empty entries, reads a key only when an entry has an equals sign, trims whitespace for collision comparison, and removes only an entry whose key is `tab_recap.job`. It preserves every other non-empty entry byte-for-byte and in order, including entries with no equals sign, an empty key, or additional equals signs in the value. It never decodes or re-encodes inherited text. The plugin appends its own serialized job entry last, so it wins on collision. If an impossible runtime value reaches `serializeJobAttributes`, its `TypeError` is logged once and the job still runs untagged so telemetry cannot block recap work. An absent or empty inherited value produces just the job entry. The parent process environment is copied, never mutated.

A sketch of the types and merge is:

```typescript
export const JOB_TAGS = ['recap-writer', 'curator', 'decider', 'judge', 'compaction-brief', 'coverage-check'] as const;
export type JobTag = typeof JOB_TAGS[number];
export type JobAttributes = Readonly<{ 'tab_recap.job': JobTag }>;

export function isJobTag(value: unknown): value is JobTag {
  return typeof value === 'string' && (JOB_TAGS as readonly string[]).includes(value);
}

export function serializeJobAttributes(attributes: JobAttributes): string {
  const value: unknown = attributes['tab_recap.job'];
  if (!isJobTag(value)) throw new TypeError('Unknown job tag');
  return `tab_recap.job=${encodeURIComponent(value)}`;
}

function keyOf(entry: string): string | null {
  const equals = entry.indexOf('=');
  return equals < 0 ? null : entry.slice(0, equals).trim();
}

export function mergeResourceAttributes(inherited: string | undefined, attributes: JobAttributes): string {
  const kept = inherited?.split(',').filter((entry) => entry !== '' && keyOf(entry) !== 'tab_recap.job') ?? [];
  return [...kept, serializeJobAttributes(attributes)].join(',');
}
```

The union members contain only lowercase letters and hyphens, so each value is percent-safe by construction; tests assert that encoding each member preserves it. The serializer still encodes values, and keys are fixed constants. A runtime guard protects values arriving from untyped code; a compile-time negative test proves an invalid literal does not type-check.

`encodeURIComponent` is a global JavaScript function that percent-encodes values. Node has no built-in typed OpenTelemetry serializer, runtime guard for this closed union, or parser that removes one exact key while preserving unrelated encoded entries byte-for-byte. The one serializer and small named merge parser are hand-written for those contracts; no runtime package is needed.

### D4. Harness observations and Codex cost

A local OTLP receiver run against Codex 0.162.1 with `OTEL_RESOURCE_ATTRIBUTES=tab_recap.job=test`, analytics enabled, and HTTP log and metric exporters observed the attribute on both log and metric resources. The run emitted `codex.turn.token_usage` as a histogram with delta aggregation temporality. `service.name` remains entry-point-defined (`codex_exec`, `codex-app-server`, or `codex_cli_rs`) and cannot be overridden. `originator` and `session_source` can identify a headless entry point but do not identify plugin work by themselves because an interactive user can also run `exec`. `[otel] span_attributes` tags spans and is not the resource mechanism used here.

Codex has no cost metric. A cost estimate uses counts by model and token type multiplied by an external per-token price table. The illustrative formula is:

```text
cost = Σ over model of ((input − cached_input) × p_in + cached_input × p_cached + cache_write_input × p_write + output × p_out)
```

This formula assumes `cached_input` is included in `input`, `cache_write_input` is separately billable, and `reasoning_output` is billed at `p_out` and included in `output`. These overlap and billing relationships were not verified for this Codex build. If reasoning output is additive rather than included, add `reasoning_output × p_out`; verification is a prerequisite to publishing a cost estimate. Never add `token_type="total"` to component counts. The plugin ships no price table.

Codex metrics require `[analytics] enabled = true` and an OTLP metrics exporter table. Without an OTLP metrics exporter, the default metrics exporter sends metrics to a vendor analytics endpoint. Any configured Codex OTel exporter also causes a turn-id-only request to the model provider. These outbound behaviors are observations for the tested build, not behavior this plugin can change.

### D5. Collector queries and metric limitations

Collectors may promote resource attributes to metric labels or expose them through a resource-info metric. Prometheus-style names below are illustrative: dot-separated OTel names are commonly translated to underscores, and unit and `_total` suffixes depend on the exporter. `tab_recap.job` may appear as `tab_recap_job`.

Illustrative Claude cost and token counters over an hour:

```promql
sum by (tab_recap_job) (increase(claude_code_cost_usage_USD_total{tab_recap_job=~".+"}[1h]))
sum by (tab_recap_job, type) (increase(claude_code_token_usage_tokens_total{tab_recap_job=~".+"}[1h]))
```

With a promoted label, tagged work and series with the label absent can be queried separately:

```promql
sum(increase(claude_code_cost_usage_USD_total{tab_recap_job=~".+"}[1h]))
sum(increase(claude_code_cost_usage_USD_total{tab_recap_job=""}[1h]))
```

An empty or absent label also matches the whole fleet if the collector did not promote the resource attribute; it must not be interpreted as proof that all work is untagged. Where the collector exposes `target_info`, the resource can be joined instead (the collector's join keys may differ):

```promql
sum by (tab_recap_job) (increase(claude_code_cost_usage_USD_total[1h]) * on (job, instance) group_left (tab_recap_job) target_info{tab_recap_job=~".+"})
```

The Claude metric names, resource attribute behavior, and environment encoding format follow Claude Code's vendor monitoring documentation; they were not run in this verification.

Codex's observed metric is a delta histogram. The README documents a collector delta-to-cumulative conversion step; after that conversion, query the cumulative `_sum` with `increase` over the desired range:

```promql
sum by (tab_recap_job, model, token_type) (increase(codex_turn_token_usage_sum{tab_recap_job=~".+"}[1h]))
```

For a delta-native backend, sum the interval points over the range (for example with its equivalent of `sum_over_time`); that backend-specific query is not the one documented by the README. When the job attribute is absent, entry-point attributes can be a fallback filter, not proof that the call belongs to the plugin. This fallback assumes the default Prometheus translation `job="codex_exec"`; a collector that promotes resource attributes may expose a different label:

```promql
sum by (job, originator, session_source, model, token_type) (codex_turn_token_usage_sum{job="codex_exec", originator="codex_exec", session_source="exec"})
```

When tagging is off, Claude cost and token series and Codex token series have no `tab_recap.job` label, so recap work cannot be separated by this attribute. If a collector never promotes the resource key, all series can appear untagged unless the resource-info join is used.

### D6. Privacy and built-ins

Attributes are constants per Job tag. No prompt, tab or lane title or identifier, path, model, or operator-specific value is included. The setting off adds nothing. `encodeURIComponent`, ordinary strings, arrays, and object copies are built-in; there is no runtime dependency.
