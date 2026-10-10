# Tasks

Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing, run from `tab-recap/`.

## 1. Vocabulary and rule

- [x] Add to `tab-recap/CONTEXT.md` the terms the relocated rationale needs (triage fills them in).
- [x] `tab-recap/rules/recap-no-comments.yml` with probes under `tab-recap/rules/probes/recap-no-comments/` (`bad.ts`
      triggers it; `good.ts` holds directive pragmas only and triggers nothing).

## 2. The codemod

- [x] Remove every comment from `tab-recap/src`, `tab-recap/bin` and `tab-recap/test`, through the TypeScript parser's
      trivia; keep the shebang and the directive pragmas; collapse the blank lines the removal leaves.
- [x] Write the removed comments (file, line, text) to a scratch file for triage; do not commit it.
- [x] Check: the leaf tokens of every file are unchanged (JSDoc excluded); `bash ci/test.sh` passes unchanged.

## 3. Triage and relocation (design section 3)

- [x] Every removed comment has exactly one destination: dropped, pinned by a test (name the test), `CONTEXT.md`,
      `README.md` or the design section 5.
- [x] Relocations written: `CONTEXT.md` and `README.md` entries, and `design.md` section 5, with source paths.
- [x] Counts per destination recorded for the merge request description.

## 4. The guard

- [x] The rule bites its bad probe and passes its good probe (`bash ci/lint.sh`).
- [x] `tab-recap/CLAUDE.md` red-lines table and `tab-recap/README.md` gates section name the rule.

## 5. Gates

- [x] `bash ci/lint.sh` passes from `tab-recap/`.
- [x] `bash ci/test.sh` passes from `tab-recap/`, with the same tests as before.
- [x] `bash ci/branch-guard.sh` is run and its result is reported; it exits 1 on a branch cut from `main` by design,
      and that is not waived.
- [x] `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict` passes.

## 6. Archive

- [ ] Run `openspec archive no-code-comments` once every other task is checked and the gates pass, in this merge request.
