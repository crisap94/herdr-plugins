# Tasks

## 1. Typed plans and registry

- [x] 1.1 Define typed pieces, duration values, confirmation and follow-up sums, and `Unsupported{why}` in the domain.
- [x] 1.2 Add the plan-adapter registry keyed by `RegisteredKind` and expose lookup through a port.
- [x] 1.3 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Generic execution

- [x] 2.1 Execute lines, delays, confirmation, retry, guidance and follow-up from the selected plan in `Sender`.
- [x] 2.2 Move the Enter delay and stalled-prompt acceptance into plan-driven adapter behavior; keep `herdr-agents.ts` generic.
- [x] 2.3 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Behavior and totality checks

- [x] 3.1 Assert all three plans as data and preserve the conformance and compaction behavior, including the pinned oddities.
- [x] 3.2 Confirm an unregistered kind returns `Unsupported{why}` without typing.
- [x] 3.3 Temporarily add a registered kind and confirm the compiler requires its plan; mutate confirmation, retry, and follow-up fields and confirm the executor tests fail.
- [x] 3.4 Run `bash ci/lint.sh`, `bash ci/test.sh`, and `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict`.

## 4. Archive

- [x] 4.1 Archive `compaction-driver` in this change and sync the main `tab-recap/harness-adapters` specification after the other tasks and gates pass.
