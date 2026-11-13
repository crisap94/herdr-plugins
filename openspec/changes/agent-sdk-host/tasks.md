# Tasks: a third host for the engine, the Claude Agent SDK in process

Paths are under `agent-sdk/` unless they start with `claude-code/` or `openspec/`. Each numbered group is its own commit. A group that
touches `claude-code/` ends with that folder's `bun run check` passing; a group that touches `agent-sdk/` ends with its `bun run check`
passing. No test makes a model call, runs a real `claude`, `codex` or `opencode` process, or runs a real Agent SDK query.

## 1. The change and the claude-code seams (S1)

- [x] 1.1 This change (`proposal.md`, `design.md`, `tasks.md`, `specs/agent-sdk/session-ledger-hooks/spec.md`). Verify: the
      headings follow `openspec/changes/claude-code-host/`.
- [x] 1.2 `claude-code/src/hook.ts` exports `factsOf(hook: HookSession, deps: Pick<HookDeps, 'stateDir' | 'clock' | 'log'>, ...)`,
      body unchanged (design D1). Verify: `bun run check` in `claude-code/` passes unchanged in behaviour.
- [x] 1.3 `claude-code/scripts/hook` exits 0 on `SESSION_LEDGER_HOST=agent-sdk` after the writer line (design D5);
      `test/launcher.test.ts` gives the test 'the launcher stands down for a session the agent-sdk host follows, even when it would
      follow a cli or headless run'; `claude-code/README.md` names the marker under "No double recaps" and in Settings. Verify:
      `bun run check` in `claude-code/` passes.
- [x] 1.4 Gates: from `claude-code/`, `bun run check` passes. No `tab-recap/` file changed, so its gates are not run in this group.

## 2. Scaffold, rules and CI (S2)

- [ ] 2.1 `agent-sdk/` with `package.json` (scripts `typecheck`, `rules`, `test`, `check`; devDependency `@anthropic-ai/claude-agent-sdk`
      0.3.311 exact; peer `^0.3.311`; `engines` node `>=18.14`), `tsconfig.json`, `bun.lock` (installed with `--omit=optional`), and
      `ci/rules.sh` (the claude-code rules plus `sdk-host-boundary`). Verify: `bun run typecheck` passes.
- [ ] 2.2 `rules/sdk-host-boundary.yml` with bad and good probes under `rules/probes/`: the bad probe imports a claude-code entry point,
      a script and a tab-recap adapter; the good probe imports the facade, the domain, ports and the allowed claude-code modules.
      Verify: `bun run rules` passes, each rule biting its bad probe.
- [ ] 2.3 A `agent-sdk` job in `.gitlab-ci.yml` (stage check) and `.github/workflows/ci.yml`, like the `claude-code` job. Verify: the
      jobs run `bun run check` in `agent-sdk/`.
- [ ] 2.4 Gates: from `agent-sdk/`, `bun run check` passes.

## 3. The core and its tests (S3)

- [ ] 3.1 `src/refreshes.ts`: the per-session map, the coalescing rerun, `settled()` and `close()` (design D4). Verify: `test/refreshes.test.ts`
      with an injected refresh: two Stops during a run give one rerun; a Stop after the run starts a new one; `close()` refuses new starts.
- [ ] 3.2 `src/follow.ts`: `followerOf(env)` (design D5). Verify: `test/follow.test.ts`: herdr, writer, and the default cases.
- [ ] 3.3 `src/merge.ts`: `mergeHooks(...sets)`, event by event, no callback dropped. Verify: `test/merge.test.ts`.
- [ ] 3.4 `src/ledger.ts` and `src/plugs.ts`: the per-event answers over `claude-code/src` (design D3); the restore as `additionalContext`
      within the 9,000-byte budget; `Stop` answers exactly `{}`; the fallback state (design D6). Verify: `test/ledger.test.ts` and
      `test/plugs.test.ts` call the callbacks directly with fake inputs and temporary folders; the restore JSON passes the
      forbidden-words check.
- [ ] 3.5 Gates: from `agent-sdk/`, `bun run check` passes.

## 4. Public API, example and README (S4)

- [ ] 4.1 `src/index.ts`: `createSessionLedger(settings?)` and `mergeHooks` (design D2); the settings defaults. Verify:
      `test/index.test.ts`: the hooks object has the registered events only, `env` carries the marker, `settled()` resolves after a
      fake refresh, and `close()` awaits it.
- [ ] 4.2 `examples/run.ts`: a program that calls `query()` with the host's hooks and env merged in, awaits `settled()` before exit.
      Written and type-checked (`bun run typecheck` covers it); never executed.
- [ ] 4.3 `README.md`: what it does, how to merge the hooks, the settings and their defaults, the double-following rule, the
      experimental switches (`restoreOnNextPrompt`, `precompactMessage`) and why, what is not documented (design Context), and "Not
      checked live". Verify: every setting in `src/index.ts` is in the README.
- [ ] 4.4 Gates: from `agent-sdk/`, `bun run check` passes; from `claude-code/`, `bun run check` passes.
