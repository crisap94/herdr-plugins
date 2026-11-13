## 1. Rewrite stale facts

- [x] 1.1 `recap()` in `tab-recap/src/recap/application/recap-job.ts` treats a tab with an open fact in another language as a switch.
- [x] 1.2 Test "a recap already stamped in the wanted language but holding an open fact in the old one is rewritten on request, and a quiet focus does not call the writer" in `tab-recap/test/recap-job.test.ts`.
- [x] 1.3 `bash ci/lint.sh` and `bash ci/test.sh` green in `tab-recap/`.
