# Tasks: a second host for the engine, a plain Claude Code session

Paths are under `tab-recap/` unless they start with `claude-code/`. Each numbered group is its own commit. Every group that
touches `tab-recap/` ends with the plugin gates passing (`bash gates/run.sh lint` and `bash gates/run.sh test`, from `tab-recap/`); a group that
touches `claude-code/` ends with that folder's own tests and type check passing. No test makes a model call or runs a real
`claude`, `codex` or `opencode` process.

## 1. Restore text (C1)

- [x] 1.1 This change (proposal, design, tasks, `specs/tab-recap/restore-text/spec.md`) and the `CONTEXT.md` row **Restore
      text**. Verify: the vocabulary step of `gates/run.sh lint` passes. `openspec validate claude-code-host --strict` is left to where
      the CLI is installed.
- [x] 1.2 The restore facts reach a host as the facade's `Engine.compacted(scope, key)` (design D1, D7). Verify: the engine's
      own tests pass.
- [x] 1.3 `application/handoff-groups.ts` and `fitGroups` shared by the handoff and the restore text (design D2). Verify: the
      handoff tests pass unchanged.
- [x] 1.4 `application/restore-text.ts` and `render/restore-markdown.ts`; `test/restore-text.test.ts`: the golden text for an
      English and a Spanish ledger, the template free of plugin words and of any hand-over, empty for an empty ledger, within the
      budget, and the engine's store path with no tab view. Verify: the test passes; `test/fixtures/engine-golden-*.txt` are
      byte-identical.
- [x] 1.5 Gates: `bash gates/run.sh lint` and `bash gates/run.sh test` pass.

## 2. The host's core (C2)

- [x] 2.1 `claude-code/` with `package.json` (workspace dependencies on the engine and agent-sdk), `tsconfig.json` (agent-sdk's strict flags), `gates/` and the
      README: how it is built and checked, which tab-recap gates do not cover it, the owner defaults, how a headless run is told
      (design D5). Verify: `bun run typecheck` passes.
- [x] 2.2 `src/payload.ts` over the captured Claude payloads (copied to `claude-code/test/fixtures/payloads`, with hand-written
      `compact` and `fork` starts). Verify: `test/payload.test.ts`.
- [x] 2.3 `src/compose.ts`, `src/lock.ts`, `src/runner.ts`. Verify: `test/compose.test.ts`, `test/lock.test.ts`,
      `test/runner.test.ts` with fakes, temporary folders and an injected settle: two runners give one run and one rerun, a stale
      lock is stolen, a dead holder does not block the next `Stop`, refresh gets the payload's scope and session, the ledger ends
      with the runs over `tab-recap/test/fixtures/replay-claude.jsonl`.
- [x] 2.4 Gates: from `claude-code/`, `bash gates/run.sh lint`, `test` and `typecheck` pass.

## 3. The plugin packaging and the commands (C3)

- [x] 3.1 `claude-code/.claude-plugin/plugin.json` (`session-ledger`) and `hooks/hooks.json`: `SessionStart` (`compact|resume`,
      10 s), `Stop` and `PostCompact` (async), `PreCompact` (10 s), each through `scripts/hook`, written against the current
      plugins and hooks reference (design D6). Verify: `test/launcher.test.ts` reads both files.
- [x] 3.2 `scripts/hook` (POSIX sh): silent exit 0 inside herdr, in a writer run, for a run not known to be interactive (unless
      `SESSION_LEDGER_HEADLESS=on`), for `PreCompact` unless on, without bun; never fails the hook. Verify:
      `test/launcher.test.ts` through `/bin/sh` with a fake runner, an empty `PATH` and a crashing bun.
- [x] 3.3 `src/main.ts`, `src/hook.ts`, `src/start-runner.ts`, `src/run.ts`, `src/runner-plugs.ts`, `src/read.ts`: each event's
      answer; the restore as `additionalContext` within 9,000 bytes; the `PreCompact` template line. Verify: `test/hook.test.ts`
      gives the exact stdout and exit code for every event, the restore's JSON passes the forbidden-words check.
- [x] 3.4 `scripts/session-ledger` (`show [--session <id>]`, `line`), `src/show.ts`, `src/sessions.ts`, `src/cli.ts`. Verify:
      `test/show.test.ts` shows the facts the fake writer wrote, read-only.
- [x] 3.5 The README (defaults and how to change them, how to try it, the cost, what is experimental and not done), a
      `unit:claude-code` job in `.gitlab-ci.yml` (stage check), a row under "Other folders" in the root
      `README.md` and a paragraph in `CONTRIBUTING.md`.
- [x] 3.6 Gates: from `claude-code/`, `bash gates/run.sh lint`, `test` and `typecheck` pass.
- [ ] 3.7 Live checks with a real Claude Code session, left to the owner (none were run): the plan's end-to-end and manual
      checks, listed in the README under "Not checked live".

## 4. Archive

- [ ] 4.1 Once every other task is checked, run `openspec archive claude-code-host` in the same merge request as the last task.
      Verify: `openspec validate --specs --strict` passes.
- [ ] 4.2 Gates: `bash gates/run.sh lint` and `bash gates/run.sh test` pass.
