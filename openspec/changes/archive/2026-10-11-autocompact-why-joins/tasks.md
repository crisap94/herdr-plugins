# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. The joined reason

- [x] 1.1 `adapters/db/autocompact-records.ts`: the amend statement keeps the stored `why` when the amend has none, takes the
  amend's when the stored one is empty, and otherwise joins them as stored, `; `, amend. Verify: `amend joins a non-null why after
  the decision's own why, keeps the decision's why when the amend has none, and takes the amend when the decision has none`
  (test/db/autocompact-records.test.ts).
- [x] 1.2 The ceiling scenario of "Every decision is recorded and listable". Verify: `a ceiling decision that waited keeps the
  flight detail and gains the coverage reason` (test/db/autocompact-records.test.ts).

## 2. Archive

- [x] 2.1 Run `openspec archive autocompact-why-joins` in this merge request, so the main autocompact spec carries the joined
  reason.
