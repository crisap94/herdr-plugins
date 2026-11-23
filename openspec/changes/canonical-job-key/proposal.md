# Proposal: the job attribute is `harness.job`

## Why

The job tag travels as the OpenTelemetry resource attribute `tab_recap.job`. The other harness-adapters consumers use one
shared vocabulary, so the key moves to `harness.job` and the plugin-specific name goes away.

## What changes

- `JOB_ATTRIBUTE_KEY` becomes `harness.job`. The six values are unchanged. There is no dual write and no alias.
- The attribute is still written only when `TAB_RECAP_TELEMETRY_TAGS=on` (default `off`), for Claude and Codex jobs.
- A promoted Prometheus label becomes `harness_job`. Saved queries on `tab_recap_job` must be renamed.
- An inherited `tab_recap.job` entry is now foreign text and passes through unchanged.

## Impact

Users with tagging on see `harness.job` in telemetry. With tagging off nothing changes. The setup text, the desktop settings
text, the reference documentation and the example configuration name the new key.
