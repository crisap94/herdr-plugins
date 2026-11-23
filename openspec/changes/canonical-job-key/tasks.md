# Tasks: canonical job key

## 1. Rename

- [x] 1.1 Set `JOB_ATTRIBUTE_KEY` to `harness.job` and update the setup choice text, the desktop catalog, the documentation and the example configuration.
- [x] 1.2 Update the test literals and add in-process tests that the Claude, Codex and OpenCode job environment carries `harness.job` and no `tab_recap.job`.
- [x] 1.3 Name Claude, Codex and OpenCode as the tagged harnesses in the setup text, the desktop catalog, the reference documentation and the specs. Verify: the golden i18n data and the setup tests pin the new text.

## 2. Verification

- [ ] 2.1 From `tab-recap/`: `bash ci/lint.sh`, `bunx tsc --noEmit` and `bash ci/test.sh` pass. Verify: the merge request pipeline is green.

## 3. Archive

- [ ] 3.1 Once every other task is checked, run `openspec archive canonical-job-key` in the same merge request as the last task. Verify: `openspec validate --specs --strict` passes.
