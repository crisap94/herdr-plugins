# Tasks

Implementation paths are under `tab-recap/`. Each implementation group ends with the plugin gates. This change specifies work only; do not implement these tasks in this specification merge request.

## 1. Vocabulary

- [ ] 1.1 Define **Job tag** in `tab-recap/CONTEXT.md` as the closed value set carried by `tab_recap.job`, distinct from the existing **Job** configuration (`{by, model, effort}`). Explain that five tags map to configured Jobs (recap writer, brief, curator, judge, decider); enumerator and coverage check share the recap-writer and decider Job configurations. Verify: the definition and examples use Job for configuration and Job tag only for the telemetry value.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Setting and setup

- [ ] 2.1 Parse `TAB_RECAP_TELEMETRY_TAGS` as `on | off`, default `off`, in the configuration loaded by `loadConfig()`.
- [ ] 2.2 Add the example setting to `tab-recap/config.example.env` and the row to `tab-recap/src/recap/application/setup-keys.ts`, `tab-recap/src/recap/render/setup.ts`, `tab-recap/src/setup/main.ts`, `tab-recap/src/i18n/en.ts`, and `tab-recap/src/i18n/es.ts`; document it in the Models/settings section of `tab-recap/README.md`.
- [ ] 2.3 Preserve environment-lock behavior so a locked setting is shown but not written by the setup save path. Verify: `test/setup-keys.test.ts` and `test/setup-view.test.ts` cover the row's `on`/`off` choice and environment lock.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Job tag and environment merge

- [ ] 3.1 Add `src/recap/domain/job-kind.ts` with `JOB_KINDS as const`, deriving `JobKind`, and define the closed `JobAttributes` record. Add the runtime `isJobKind` guard. Verify: `test/job-kind.test.ts` checks all six values and a compile-time `@ts-expect-error` case rejects an unknown literal.
- [ ] 3.2 Add one serializer and one named merge parser in `src/adapters/process.ts`; preserve inherited non-empty entries byte-for-byte, remove only the exact colliding key, drop empty entries, and append the encoded plugin attribute. Verify: `test/job-telemetry.test.ts` covers absent and empty input, stray commas, repeated equals, no equals, empty key, collision, parent environment immutability, and encoding identity for every union member.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Harness calls and Job tag mapping

- [ ] 4.1 Carry the optional, default-off Job tag through the `Make` function in all five entries of `src/daemon/harness-makers.ts`, then through each supported child environment call to `scrubbedEnv()` in `src/adapters/process.ts`; leave the `Harness` port unchanged. OpenCode, Hermes, and custom makers accept and ignore the value. Experiment/probe tooling (`experiment-arms`, `experiment-labeller`, `autocompact-briefs`) and git children (`git-lane-repo`) stay untagged.
- [ ] 4.2 Map recap writer and enumerator calls (including `bin/replay.ts`) to `recap-writer`; both curator modes to `curator`; judge calls to `judge`; brief calls to `compaction-brief`; harness-backed decider calls to `decider`; and harness-backed brief checks to `coverage-check`. Keep remote HTTP-backed decisions, OpenCode, and Hermes untagged; keep custom resource attributes unchanged.
- [ ] 4.3 Apply the setting to every job harness built from `loadConfig()`, including the daemon and `bin/replay.ts` / evaluation judge paths. Require Claude telemetry variables in the daemon process environment as the supported path. Configure Codex exporters in its config under inherited `CODEX_HOME`; document that relied-on Codex OTel environment variables such as headers must be in the daemon environment.
- [ ] 4.4 Verify: `test/harness-makers.test.ts` checks each kind mapping, `test/job-telemetry.test.ts` checks off is byte-identical and only Claude/Codex get the tag, and a local Codex receiver run sees the tag on log and metric resources with the tested Codex version and observed temporality.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 5. Documentation and validation

- [ ] 5.1 Document Claude queries, label normalization, collector promotion failure mode and `group_left` join in `tab-recap/README.md`. Separately document Codex temporality-aware queries and fallback labels, then its cost formula assumptions, exporter preconditions, and telemetry environment requirements.
- [ ] 5.2 Verify cached-input, cache-write, reasoning-output, and output overlap before publishing a Codex cost estimate. Keep the plugin price table out of scope.
- [ ] 5.3 Review all change files for public-safe content, English, no comments in examples, closed job values, and no content-bearing attributes. Verify: `openspec validate --all --strict` and the privacy grep over the full diff.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 6. Archive

- [ ] 6.1 In the implementation merge request, after every implementation task is checked and the plugin gates pass, run `openspec archive tag-job-telemetry`. Do not archive this specification-only change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
