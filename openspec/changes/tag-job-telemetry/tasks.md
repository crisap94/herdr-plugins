# Tasks

Implementation paths are under `tab-recap/`. Each implementation group ends with the plugin gates. This change specifies work only; do not implement these tasks in this specification merge request.

## 1. Vocabulary

- [ ] 1.1 Add **Job tag** to `CONTEXT.md`: the constant `tab_recap.job` resource attribute whose value is the closed job kind. Verify the vocabulary lint accepts it.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Setting and setup

- [ ] 2.1 Parse `TAB_RECAP_TELEMETRY_TAGS` as `on | off`, default `off`, at the configuration edge. Add the setting row to `config.example.env` and the setup modal, including environment-lock behavior and localized labels.
- [ ] 2.2 Verify off preserves the child environment byte-for-byte and that on does not alter environments for harnesses without a verified mechanism.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Typed job tags and harness adapters

- [ ] 3.1 Add the closed `JobKind` union and typed job attribute record for `recap-writer`, `curator`, `decider`, `judge`, `compaction-brief`, and `coverage-check`; route values from the job harness registry, never from free strings.
- [ ] 3.2 Add one `OTEL_RESOURCE_ATTRIBUTES` serializer using `encodeURIComponent` for values. Preserve existing well-formed attributes, replace an existing `tab_recap.job` with the plugin value, and omit malformed entries.
- [ ] 3.3 Hook the serialized value into the registry-backed adapter method that builds a child environment and invocation for Claude and Codex after T6 and T7 have landed. Keep OpenCode, Hermes, and custom environments unchanged.
- [ ] 3.4 Verify the six job kinds on both supported harnesses; closed-union rejection; percent-encoding; existing attributes and collision precedence; and absent telemetry fields when off.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Documentation and validation

- [ ] 4.1 Document the Claude and Codex dashboard queries, collector label promotion or resource-info join, Codex token-to-cost formula and pricing limitation, Codex exporter precondition, and the untagged behavior when off.
- [ ] 4.2 Review the published specifications and examples for privacy: only constant job kinds may appear as attribute values; do not add prompts, titles, ids, paths, models, or operator-specific values.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
- [ ] Run `openspec validate --all --strict`.

## 5. Archive

- [ ] 5.1 In the implementation merge request, after every implementation task is checked and the plugin gates pass, run `openspec archive tag-job-telemetry`. Do not archive this specification-only change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
