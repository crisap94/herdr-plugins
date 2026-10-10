# Tasks

Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing from `tab-recap/`.

## 1. The rule

- [x] 1.1 Add `rules/recap-no-harness-literals.yml` with its allow-list.
- [x] 1.2 Add the `bad.ts` and `good.ts` probes and show both behave (bad triggers, good does not).

## 2. Remove the offenders

- [x] 2.1 Add `replayKindOf(flag, file)` to the reader registry module and use it in `bin/replay.ts`; add a unit test for every default and flag case.
- [x] 2.2 Export `CLAUDE_KIND` from the Claude transcript adapter, define the reader's `agent` from it, and use it in `bin/autocompact-briefs.ts`.
- [x] 2.3 Export `CODEX_PROGRAM` from the Codex harness adapter, use it where the adapter starts the program, and use it in `bin/autocompact-label.ts`.
- [x] 2.4 `rg` finds no harness-id literal in `src/` or `bin/` outside the allow-list.

## 3. Keep the guard honest

- [x] 3.1 Add a test that the rule's id list equals the ids in the registered kinds and the job harness registry.
- [ ] 3.2 Show that a `'claude'` literal added to a core file makes `bash ci/lint.sh` fail, then remove it.

## 4. OpenSpec

- [x] 4.1 `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict` passes.

## 5. Archive

- [ ] 5.1 Archive this change in this merge request after all tasks and gates pass, and sync the main `tab-recap/harness-adapters` specification.
