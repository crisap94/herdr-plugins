# Tasks

## 1. One entry

- [x] 1.1 `gates/run.sh lint|test` runs the steps of `ci/lint.sh` and `ci/test.sh`, and both scripts are deleted. Verify: lint and test give the same exit codes and pass counts as before, and a seeded rule violation fails lint.
- [x] 1.2 The requirements that named the old scripts name `gates/run.sh`. Verify: `openspec validate --strict` passes.

## 2. Archive

- [x] 2.1 The change is archived in the merge request that deletes the scripts.
