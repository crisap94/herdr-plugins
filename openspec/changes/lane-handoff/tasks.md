# Tasks

Implementation paths are under `tab-recap/`. This change specifies work only; do not implement these tasks in the specification merge request. No code or test file may contain comments.

## 1. Vocabulary

- [ ] Add **Handoff**, **Handoff source**, **Handoff target**, **Handoff plan**, and **Handoff outcome** to `tab-recap/CONTEXT.md` before implementation code. Define Handoff as a one-time, operator-requested continuation of one task's ledger to another idle lane; distinguish source lane from target lane and Handoff plan from Compaction plan. Verify vocabulary and banned synonyms use existing terms consistently.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Domain values and content builder

- [ ] Add branded `HandoffId` and reuse or add typed pane, task, duration, section, and reason values in the domain. Parse CLI and herdr values once at their edges; expose a closed content-input and content-result union.
- [ ] Build the deterministic first-person English handoff from one task's goal, open facts, recently closed facts, decisions with reasons, rules, and next steps. Enforce stable order, note limit, 3,000-character bound, whole-fact truncation, and the shared vetting rule. Use one serializer for the handoff format.
- [ ] Verify tests for each included fact class, omitted context, deterministic ordering, empty ledger, note normalization, all truncation priorities, and forbidden words across every template.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Source and target resolution

- [ ] Add typed source and target resolvers. Require `--from` and `--to`, bind a source lane to exactly one task, and refuse a missing source or target without falling back to tab-wide history.
- [ ] Require a registered target with a delivery plan, status `idle` or `done`, and a supported no-work-in-flight result. Refuse `working`, `blocked`, unknown, awaiting, or unreadable states. Acquire source and target claims atomically; refuse if either is claimed by compaction or another handoff.
- [ ] Verify each resolution and refusal scenario, multi-task tabs, stale pane identities, and source/target identity collision.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 4. Delivery through the adapter

- [ ] Define the closed typed Handoff plan on each registered kind's adapter, including Claude line delivery and Codex/OpenCode prompt delivery, delays, confirmation, and failure behavior. Extend only `src/adapters/herdr-agents.ts` with names for `agent.prompt`, `pane.send_text`, and `pane.send_keys`; preserve the prompt-boundary rule and `recap-never-types`.
- [ ] Acquire and release `typing-tab-recap`, honor earlier live leases, do not retry ambiguous sends, and report only confirmed sends as delivered. Implement `--print` as a pure path that does not type or acquire a typing lease.
- [ ] Add the handoff typing side to `test/adapter-conformance.test.ts`; use fake herdr, status, and transcript adapters for every plan. Verify the vocabulary, i18n, no-comments, and prompt-boundary rules reject bad probes.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 5. CLI and i18n

- [ ] Add `tab-recap handoff --from <pane> --to <pane> [--note <text>] [--print]`, help and usage, strict option parsing, and the 0/1/2/3 exit mapping. Keep handoff text on stdout only for `--print`, diagnostics on stderr, and secrets out of output.
- [ ] Add typed en/es command messages and parity coverage. Ensure the handoff payload itself remains English regardless of locale.
- [ ] Verify valid, missing, duplicate, conflicting, and unknown flags; each outcome-to-exit mapping; and print mode's zero typing calls.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 6. Record and migration decision

- [ ] Keep slice 1 free of a persisted handoff row and migration. Verify that the CLI can report its typed result and that the future token announcer can consume the delivered result without a stored row.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 7. Real herdr proof

- [ ] On a real herdr, create an idle target lane and verify a handoff arrives once; verify a working target is refused and receives no text; verify `--print` emits the handoff and types nothing. Record environment-safe evidence without secrets.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 8. Archive

- [ ] After every implementation task is checked and the gates pass, run `openspec archive lane-handoff` in the implementation merge request so the main specs are updated. Do not archive this specification-only change.
- [ ] Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.
