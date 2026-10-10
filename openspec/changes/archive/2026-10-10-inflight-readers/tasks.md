# Tasks

## 1. Reader contracts and implementations

- [x] 1.1 Add the required typed in-flight capability to each transcript reader and update the conformance pins deliberately.
- [x] 1.2 Implement the pure Codex rollout scanner, bounded tail reader, synthetic cases A–F, and tests.
- [x] 1.3 Implement opencode tool-part counting and generated SQLite cases for completed, error, running, pending, `time.start` only, and `finish: stop`.
- [x] 1.4 Add focused tests for supported, unsupported, unregistered and screen reader gate reasons.
- [x] 1.5 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Gate and shadow run

- [x] 2.1 Preserve the idle/done sweep gate and report known open work as stale without blocking its decision.
- [x] 2.2 Add the typed `TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS` setting, record-only behavior, documentation, and tests that assert no request is queued.
- [x] 2.3 Verify the default autocompact kinds remain Claude only and mutate each reader's wait, state-count and budget-growth rule.
- [x] 2.4 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Specifications and review

- [x] 3.1 Update `CONTEXT.md`, README/config example, and the harness-adapters and autocompact specifications.
- [x] 3.2 Record the survey's unresolved questions and idle-gate decision in the design.
- [x] 3.3 Run `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict` from the repository root.

## Archive

- [x] 4.1 Archive `inflight-readers` after all tasks and gates pass, and synchronize the main specifications.
