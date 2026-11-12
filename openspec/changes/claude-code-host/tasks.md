# Tasks: a second host for the engine, a plain Claude Code session

Paths are under `tab-recap/` unless they start with `claude-code/`. Each numbered group is its own commit. Every group that
touches `tab-recap/` ends with the plugin gates passing (`bash ci/lint.sh` and `bash ci/test.sh`, from `tab-recap/`); a group that
touches `claude-code/` ends with that folder's own tests and type check passing. No test makes a model call or runs a real
`claude`, `codex` or `opencode` process.

## 1. Restore text (C1)

- [x] 1.1 This change (proposal, design, tasks, `specs/tab-recap/restore-text/spec.md`) and the `CONTEXT.md` row **Restore
      text**. Verify: the vocabulary step of `ci/lint.sh` passes. `openspec validate claude-code-host --strict` is left to where
      the CLI is installed.
- [x] 1.2 `Engine.restore(scope, session)` returns the restore facts (design D1); `ci/engine-files.json` is unchanged. Verify:
      `test/engine-files.test.ts` passes.
- [x] 1.3 `application/handoff-groups.ts` and `fitGroups` shared by the handoff and the restore text (design D2). Verify: the
      handoff tests pass unchanged.
- [x] 1.4 `application/restore-text.ts` and `render/restore-markdown.ts`; `test/restore-text.test.ts`: the golden text for an
      English and a Spanish ledger, the template free of plugin words and of any hand-over, empty for an empty ledger, within the
      budget, and the engine's store path with no tab view. Verify: the test passes; `test/fixtures/engine-golden-*.txt` are
      byte-identical.
- [x] 1.5 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 2. Archive

- [ ] 2.1 Once every other task is checked, run `openspec archive claude-code-host` in the same merge request as the last task.
      Verify: `openspec validate --specs --strict` passes.
- [ ] 2.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.
