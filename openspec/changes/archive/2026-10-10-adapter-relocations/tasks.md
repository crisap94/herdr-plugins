# Tasks

## 1. Environment and screen ownership
- [x] 1.1 Add typed `job.envScrub` declarations and preserve `scrubbedEnv()` output with golden and extra-name tests
- [x] 1.2 Pass adapter-owned screen chrome to the cleaner and pin its previous corpus output
- [x] 1.3 `bash ci/lint.sh` and `bash ci/test.sh` pass from `tab-recap/`

## 2. Session and transcript ownership
- [x] 2.1 Resolve typed session ids through a complete registered-kind table and a behavior-preserving fallback
- [x] 2.2 Move observed context functions and tool-name maps beside their adapters; keep shared call helpers
- [x] 2.3 Golden tests cover registered and unknown session id/path values, screen output, and environment output
- [x] 2.4 Mutation checks show that breaking each moved behavior fails its golden tests
- [x] 2.5 `rg` proofs confirm env names are declared in the registry, screen chrome is outside the application, and the shared session filename helper is used by each kind and fallback
- [x] 2.6 `bash ci/lint.sh` and `bash ci/test.sh` pass from `tab-recap/`

## 3. Archive
- [x] 3.1 Archive `adapter-relocations` in this merge request after all tasks and gates pass; update the main harness-adapters spec
