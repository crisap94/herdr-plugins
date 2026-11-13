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

## 2. The host's core (C2)

- [x] 2.1 `claude-code/` with `package.json` (no dependencies), `tsconfig.json` (tab-recap's strict flags), `ci/rules.sh` and the
      README: how it is built and checked, which tab-recap gates do not cover it, the owner defaults, how a headless run is told
      (design D5). Verify: `bun run typecheck` passes.
- [x] 2.2 `src/payload.ts` over the captured Claude payloads (copied to `claude-code/test/fixtures/payloads`, with hand-written
      `compact` and `fork` starts). Verify: `test/payload.test.ts`.
- [x] 2.3 `src/compose.ts`, `src/lock.ts`, `src/runner.ts`. Verify: `test/compose.test.ts`, `test/lock.test.ts`,
      `test/runner.test.ts` with fakes, temporary folders and an injected settle: two runners give one run and one rerun, a stale
      lock is stolen, a dead holder does not block the next `Stop`, refresh gets the payload's scope and session, the ledger ends
      with the runs over `tab-recap/test/fixtures/replay-claude.jsonl`.
- [x] 2.4 Gates: from `claude-code/`, `bun run check` (type check, rules, tests) passes.

## 3. Archive

- [ ] 3.1 Once every other task is checked, run `openspec archive claude-code-host` in the same merge request as the last task.
      Verify: `openspec validate --specs --strict` passes.
- [ ] 3.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.
