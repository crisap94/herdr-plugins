# Tasks

Implementation tasks for the follow-up implementation merge request. This specification change is documentation only; no task is checked.

## 1. Plan type

- [ ] 1.1 Define typed line pieces, duration-backed delays, the confirmation sum, follow-up sum, and the complete compaction plan. Use existing domain value objects where available and represent unsupported plans separately from `Unknown`.
- [ ] 1.2 Define exhaustive plan execution outcomes and the registered-kind plan registry contract.
- [ ] 1.3 Run `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict` from the repository root.

## 2. Adapters' plans

- [ ] 2.1 Add Claude, Codex, and OpenCode plans with the exact command pieces, delays, confirmation, retry, guidance, and follow-up behavior pinned by the conformance suite.
- [ ] 2.2 Link the plan registry to T2's `RegisteredKind` union so each new domain table row requires one adapter registry entry at compile time; return `Unsupported{why}` for kinds with no plan.
- [ ] 2.3 Preserve T3's context-window sources and guidance calculation without moving their implementation.
- [ ] 2.4 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Sender as generic executor

- [ ] 3.1 Replace harness-specific branches in `compaction-send.ts` with exhaustive execution of the selected plan.
- [ ] 3.2 Move the Enter delay and stalled-prompt rule out of `herdr-agents.ts` into plan-driven behavior while preserving the pinned outcomes.
- [ ] 3.3 Ensure unsupported plan lookup types no command and reports its reason; retain existing target filtering.
- [ ] 3.4 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Tests

- [ ] 4.1 Update or extend the sender conformance tests to assert typed plans and unchanged Claude, Codex, and OpenCode behavior, including the pinned oddities and direct unsupported lookup.
- [ ] 4.2 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
- [ ] 4.3 Run `npx --yes @fission-ai/openspec@1.12.0 validate --all --strict` from the repository root.

## 5. Archive

- [ ] 5.1 In the implementation merge request, once every other task is checked and the gates pass, archive `compaction-driver` in that same merge request and sync the main `tab-recap/harness-adapters` specification. Do not archive this change in the specification-only branch.
