# Tasks: cut the engine boundary in place

Paths are under `tab-recap/`. Each numbered group is its own merge request. Every group ends with the plugin gates passing
(`bash ci/lint.sh` and `bash ci/test.sh`, from `tab-recap/`). No step changes the writer's input or the stored values.

## 1. Change and vocabulary

- [ ] 1.1 This change (proposal, design, tasks, `specs/tab-recap/engine-boundary/spec.md`) and the `CONTEXT.md` rows **Engine**,
      **Scope**, **Followed session** and the engine's sense of **Host**, before any code. Verify: `openspec validate engine-boundary
      --strict` passes and the vocabulary step of `ci/lint.sh` passes.
- [x] 1.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 2. Pin behaviour

- [x] 2.1 `test/engine-golden.test.ts`: replay `test/fixtures/replay-claude.jsonl` with a fake summarizer and the scratch store
      (`src/adapters/db/scratch.ts`); snapshot the writer's input bytes and the resulting facts. Verify: the test passes, and it is
      unchanged by every later group.
- [x] 2.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 3. `RecapCause` out of the intents

- [x] 3.1 New `src/recap/domain/recap-cause.ts`; `domain/intent.ts` re-exports it; `recap-job.ts` and `ports/recap-records.ts`
      import the new file; regenerate `ci/lanes.json` with `bun ci/lanes-generate.ts`. Verify: `board.ts` and `intent.ts` are no
      longer in the closure of `recap-job.ts`, and the golden test is unchanged.
- [x] 3.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 4. Screens leak

- [x] 4.1 If `ports/screens.ts` is reached through `ports/transcript-registry.ts`, narrow the engine's source to `readerFor(agent)`;
      the screen fallback stays on the host side. Verify: `ports/screens.ts` is not in the closure, and the golden test is unchanged.
- [x] 4.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 5. Manifest and guard

- [x] 5.1 `ci/engine-files.json`, read by `.dependency-cruiser.cjs` the way `ci/brand-importers.json` is, and the rule
      `engine-self-contained`: an engine file imports only engine files (and `node:util`). Verify: a bad probe (an engine file
      importing `src/daemon/`) fails the rule with the path named; a good probe passes.
- [x] 5.2 `test/engine-files.test.ts`, modelled on `test/brand-importers.test.ts`: the manifest equals the computed closure of
      `recap-job.ts`. Verify: the test fails when a file is added to or removed from the manifest by hand.
- [x] 5.3 Add `engine-self-contained` to the red-lines table in `tab-recap/CLAUDE.md`. Verify: the row exists.
- [x] 5.4 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 6. Facade

- [x] 6.1 `src/recap/application/engine.ts` per design D3: `createEngine({ source, store, models, environment, settings, ran? })`
      returning `turnEnded`, `refresh`, `sessionStarted`, `compacted` and `history`, which return facts, not text. Verify: a test
      drives each method over the scratch store, and the facade is in the manifest.
- [x] 6.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 7. Re-point replay

- [x] 7.1 `src/recap/application/replay.ts` builds its job through `createEngine`; `bin/replay.ts` is unchanged. Verify: `bun
      bin/tab-recap.mjs eval --replay <fixture>` gives the same output before and after, and the golden test is unchanged.
      Ran instead: the golden test, which drives `replay` through the facade, unchanged; `eval --replay` was not run, since it
      calls a live model whose output differs run to run.
- [x] 7.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 8. Re-point the daemon

- [x] 8.1 `src/daemon/main.ts` builds the engine once; `daemon/dispatch-parts.ts`, `daemon/compaction.ts`, `daemon/handoff.ts`,
      `daemon/autocompact.ts` and `application/dispatch.ts` take `Pick<Engine, ...>`. Verify: `RecapJob` is constructed in one place
      only, and a recap is written after a turn when the plugin runs from the checkout on one tab.
      Ran instead: typecheck and the suite. The live check (one tab, one turn, from the checkout) has not run; run it before
      merge.
- [x] 8.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 9. No-herdr proof

- [x] 9.1 `test/engine-plain-session.test.ts`: the engine over the Claude transcript reader, the scratch store and fixture paths
      (`claude-compact-boundary.jsonl` for the compaction case), importing nothing from `adapters/herdr`, `transport` or `daemon`.
      Verify: the test passes and its imports hold none of those folders.
- [x] 9.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 10. Archive

- [ ] 10.1 Once every other task is checked, run `openspec archive engine-boundary` in the same merge request as the last task.
      Verify: `openspec validate --specs --strict` passes and `openspec/specs/tab-recap/engine-boundary/spec.md` exists.
      Left open with 1.1: the `openspec` CLI is not installed where groups 1 to 9 ran, so neither validate nor archive has run.
- [ ] 10.2 Gates: `bash ci/lint.sh` and `bash ci/test.sh` pass.
