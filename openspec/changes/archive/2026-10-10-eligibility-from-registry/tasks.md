# Tasks

Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing from `tab-recap/`.

## 1. Registry capabilities

- [x] 1.1 Add the domain kind capability table and derive the three existing lists from it.
- [x] 1.2 Require the transcript reader table to cover the domain kind union.
- [x] 1.3 Parse replay's optional `--kind` through `readerKindOf` at the input edge.
- [x] 1.4 Add the agent kind capability term to `tab-recap/CONTEXT.md`.
- [x] 1.5 `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 2. Eligibility proof

- [x] 2.1 Add `test/eligibility.test.ts` for current list values and total capability declarations.
- [x] 2.2 Flip one capability temporarily and verify the focused test fails, then restore it.
- [x] 2.3 `bash ci/lint.sh` and `bash ci/test.sh` pass.

## 3. OpenSpec

- [x] 3.1 Add the eligibility requirement and design for this change.
- [x] 3.2 `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict` passes.

## 4. Archive

- [x] 4.1 Archive this change in this merge request after all tasks and gates pass.
