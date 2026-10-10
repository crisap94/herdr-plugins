# Design

## Typed plan and ownership

Represent a plan as domain values rather than assembled strings or numeric conventions. A typed line contains ordered text-piece values, allowing a single line such as Claude's command plus guidance to preserve its two-piece typing behavior. Durations use the existing `Duration` value object. Confirmation is a closed sum: `turn-end` or `poll` with a typed read count and interval duration. Retry, stall acceptance, follow-up, and guidance support are explicit fields. Follow-up is a sum of `restore-message` and `none`; unsupported plan lookup is `Unsupported{why}`, distinct from the existing `Unknown` result for an answer that cannot be determined now. Handling these sums is exhaustive.

The registered-kind plan registry uses the `RegisteredKind` type from T2's `REGISTERED_KINDS`. Its record must satisfy every registered kind, and no adapter-only kind is allowed. Adding a kind therefore requires exactly two compiler-linked edits: a domain table row declaring its eligibility and a plan-adapter registry entry. The plan entry may explicitly return `Unsupported{why}` when the kind cannot compact. Unknown raw lane kinds never fall through to a Codex plan.

`Sender` resolves the plan before typing, then executes its typed lines, delays, confirmation mode, retry rule, and follow-up. Adapter-specific behavior is data; the core has no `kind === 'claude'` branch. The Herdr transport applies the plan's Enter delay and stall acceptance while retaining generic wire behavior.

## Behavior retained

- Claude types `/compact ` and its guidance as two pieces, waits for turn-end confirmation, retries once after a self-failure, and sends no restore message.
- Codex and OpenCode type the bare `/compact` command, poll confirmation for 20 looks with a one-second interval, do not retry a self-failure, and send the restore message unless the outcome is failed. An unconfirmed outcome still sends the restore message.
- The sender still filters targets through the registered compactable set before sending. A direct sender request for an unregistered kind now returns an explicit unsupported result instead of taking the Codex path; this closes the latent fallback without changing reachable behavior for current registered kinds.
- The Herdr line entry delay remains 300 ms. A stalled prompt continues to be accepted as sent.
- Poll look counts preserve the current total of 20 looks; each look still runs the existing outcome/mark inspection, including its per-mark settle reads and delays.

No T0 conformance pin is deliberately changed. Existing confirmation, retry, restore, and timing oddities remain as recorded.

## Context-window boundary

T4 consumes the guidance already assembled for a compaction and does not calculate token windows. T3's window sources remain authoritative: agent-reported window, injected model catalogue, Claude family table, observed growth, and operator setting retain their existing precedence and source labels. This change does not move or reinterpret those sources.

## Implementation scope

Expected implementation paths are `tab-recap/src/recap/domain/compaction-plan.ts` (typed plan values), `tab-recap/src/ports/compaction-plans.ts` (plan capability), `tab-recap/src/ports/agents.ts` (typed line execution), `tab-recap/src/adapters/compaction-plan-registry.ts`, `tab-recap/src/adapters/claude-compaction.ts`, `tab-recap/src/adapters/codex-compaction.ts`, `tab-recap/src/adapters/opencode-compaction.ts`, `tab-recap/src/recap/application/compaction-send.ts`, and `tab-recap/src/adapters/herdr-agents.ts`. The implementation may keep the per-kind plan methods on its bundled adapter modules instead of creating the three named plan files, provided the typed registry contract and ownership requirement remain the same. Tests stay in `tab-recap/test/adapter-conformance-send.test.ts`, `tab-recap/test/compaction.test.ts`, and `tab-recap/test/fakes/compaction-fleet.ts` as needed to assert unchanged behavior.

T4 must not edit `tab-recap/src/adapters/claude-in-flight.ts`, add Codex/OpenCode in-flight readers, or change `tab-recap/src/daemon/autocompact.ts`; T5 owns in-flight readers and their gate. T4 must not edit `tab-recap/src/recap/application/decode.ts` or `tab-recap/src/adapters/context-rows.ts`; T7 owns those relocations. It also leaves `tab-recap/src/recap/domain/registered-kinds.ts`, `tab-recap/src/recap/domain/compaction.ts`, `tab-recap/src/adapters/model-catalogue.ts`, and the T3 context-window implementation unchanged, consuming their existing typed contracts.

## Operator questions

1. Should the current 20 confirmation looks be retained exactly? Recommended answer: yes; the conformance suite pins them.
2. Should an unconfirmed non-Claude compaction still send its restore message? Recommended answer: yes; preserve the pinned behavior.
3. Should an unregistered kind be explicitly refused even when `Sender` is called directly? Recommended answer: yes; return `Unsupported{why}` and keep target filtering unchanged.
