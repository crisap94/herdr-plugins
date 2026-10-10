# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. The table (design decision 1)

- [x] 1.1 `test/adapter-conformance.test.ts`: one row per kind (claude, codex, opencode, the screen reader), and the
  assertions for each row: locate, a read from its own position, `latestPrompt` moves no position, `observed` for an
  empty source and the recorded numbers, the recorded marks, `inFlight` and the autocompact message, compactability.
  Verify: `node --test test/adapter-conformance.test.ts` passes.
- [x] 1.2 Every pinned oddity carries a `PINS TODAY:` comment in the file that pins it.
  Verify: `grep -n "PINS TODAY" test/adapter-conformance*.test.ts` lists each one.

## 2. The missing cells (design decision 2)

- [x] 2.1 `test/adapter-conformance-send.test.ts`: the opencode compaction send path (what is typed, in which pieces,
  the polling, the restore message, no retry); the named test "every non-Claude kind takes the Codex path"; an unknown
  kind through `Sender`; an unconfirmed non-claude compaction. Shared fakes in `test/fakes/compaction-fleet.ts`.
  Verify: `node --test test/adapter-conformance-send.test.ts` passes.
- [x] 2.2 Hermes refuses, in the same conformance table file: not compactable, `no reader for hermes` in the recap,
  and autocompact stops the lane in-flight. Verify: `hermes refuses: …` passes.
- [x] 2.3 Job harnesses: every `BACKEND_IDS` id has a maker that names itself; `custom` has no model and no
  enumerator. Verify: `every BACKEND_IDS id has a maker …` passes.

## 3. Gates

- [x] 3.1 `bash ci/lint.sh`, `bash ci/test.sh` and `bash ci/branch-guard.sh` pass from `tab-recap/`.
- [x] 3.2 `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict` passes from the repository root.

## 4. Archive

- [ ] 4.1 `openspec archive adapter-conformance-suite` in a follow-up merge request, once this change is live on main.
