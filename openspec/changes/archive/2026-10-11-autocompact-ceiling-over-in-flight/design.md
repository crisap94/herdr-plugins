# Design: a full lane is compacted even while it waits, and a compaction is queued instead of refused

## Context

| Fact | Measured | Where |
| --- | --- | --- |
| Skipped full lanes | 4 lanes at 84 %, 90 %, 92 %, 95 %, all with gate `in-flight`, details `awaiting <names>` or `N running` | `tab-recap autocompact --all`, 2026-10-11 04:26 UTC |
| Gate order | the in-flight answer is read only when the cheap gates give `ask` or `ceiling`, and any count above zero or `unknown` gives `in-flight` before the ceiling | `src/recap/domain/autocompact.ts` (`gateOf`), `src/recap/application/autocompact.ts` (`gated`, `flightOf`) |
| Awaited reply | the `awaiting` token makes `flightOf` answer `{ count: 1, detail: 'awaiting <value>' }`; `waitSkipped` checks it again right before recording | `src/recap/application/autocompact.ts` |
| What Claude counts | launches with `run_in_background: true` and the tools `Agent`, `Task`, `Monitor` (a synchronous `Agent` result removes it); an end notice (`completed`, `failed`, `killed`, `stopped`) or a `Monitor` timeout ends it | `src/adapters/claude-in-flight.ts` |
| What Codex counts | open function calls plus script cells still running | `src/adapters/codex-in-flight.ts` |
| What opencode counts | tool parts whose state is `pending` or `running` | `src/adapters/opencode-in-flight.ts` |
| Considered lanes | autocompact considers only lanes whose agent is idle or done, so a foreground tool call never reaches the in-flight reader | autocompact spec, "The gates come before any model call" |
| Status refusals | the flow refuses a lane whose status is not `idle`/`done` when the request is taken and again after the brief is written (`refusalOf`, `refused`); the brief is a model call | `src/recap/application/compaction.ts` |
| How it types | each plan line is `pane.send_text` per piece, then `pane.send_keys enter`; a `blocked` answer is refused | `src/adapters/herdr-agents.ts` (`typeLine`), `src/recap/application/compaction-send.ts` |
| Plans per kind | Claude: `/compact <guidance>`, confirm on turn end, retry once on self-failure; Codex and opencode: `/compact`, confirm by polling, restore message after | `src/adapters/compaction-plan-registry.ts` |
| Confirmation | waits for the lane to settle after the typing (up to 10 min), then reads the compaction marks after the typing instant | `src/recap/application/compaction-outcome.ts` |
| Background work across `/compact` | UNMEASURED: whether Claude Code keeps background shells, monitors and background agents running across `/compact` and still delivers their end notices | task 0.1 |
| Typed input during a turn | UNMEASURED: whether Claude Code queues `/compact <guidance>` typed while a turn runs and runs it as the compaction once the turn ends | task 0.2 |

## D1 — In-flight work is split into foreground and background

An in-flight reader answers two counts: work that would be cut by a compaction (foreground) and work the harness keeps
running across a compaction (background), with each background item's tool and its own short label from the launch
(the `description` input of a `Monitor`, an `Agent` or a background shell; the tool name when none). Only the foreground
count holds the gate. The `unknown` answer still holds it, as today.

Per kind, from what each reader can see:

- **Claude**: everything the reader counts today is background work (a foreground call cannot be open while the lane is
  idle or done), so its foreground count is zero and the items it found are background items, *once task 0.1 confirms
  they survive `/compact`*. Until then Claude keeps today's rule.
- **Codex**: open function calls are foreground; running script cells are not known to survive a compaction, so they
  stay foreground. Codex keeps today's rule, by name: `codex cannot tell background work that survives a compaction`.
- **opencode**: tool parts `pending` or `running` are foreground. opencode keeps today's rule, by name.
- A kind with no reader keeps `unknown`, as today.

## D2 — At or above the ceiling, a wait does not hold the lane

The awaiting token stays a reason to wait below the ceiling, unchanged. At or above the ceiling it no longer holds the
gate, and neither does the late check in `waitSkipped`: the decision is `compact` with gate `ceiling`, its detail is
`ceiling-overrides-wait (awaiting <names>)`, and the request carries the note of D3. A foreground count above zero or
`unknown` still holds the lane at any share, with detail as today.

## D3 — The compaction note says what the lane was waiting for

An automatic compaction requested while the lane waits or runs background work carries a note, so the agent picks the
work up again: `Still waiting for: <names>. Still running: <tool> "<label>", ...`. The names come from the awaiting
token, the items from D1, through the same plain-text sanitizer the notes use today; the note is cut to fit 400
characters (UNMEASURED, task 0.3 checks that the brief writer keeps it). With nothing to say the note stays null, as
today. A requested compaction keeps its own note; an automatic note joins it only when the request has none.

## D4 — A compaction is queued behind the current turn

Each kind's compaction plan declares whether the harness queues typed input while a turn runs (`queues`) or needs the
lane idle (`needs-idle`, with the reason). For a `queues` kind the status checks no longer refuse `working`: the request
is taken and the brief is written whatever the lane does, and the plan's lines are typed while the agent works; the
harness runs the compaction when its turn ends. A `blocked` lane (a question or approval on screen) still refuses at
both checks and when typing, since typing would answer it. An unknown status still fails, as today. A `needs-idle` kind
keeps today's refusal, by name: Codex and opencode, `queued input is not measured for this kind`, until a measurement
moves them.

Claude declares `queues` only once task 0.2 confirms it; until then it keeps `needs-idle`.

Typing into a working lane goes through the same typing lease as today, so it never interleaves with another writer.

## D5 — A queued compaction waits for its own mark

The typing instant no longer tells the current turn apart from the compaction's turn. Confirmation of a queued
compaction therefore waits for a compaction mark after the typing instant, re-reading the marks each time the lane
settles, within the existing 10-minute bound; it is `unconfirmed` only when the bound passes with no mark. A retry on
self-failure is typed only after a `failed` mark, so a queued compaction is never typed twice for one turn.

## D6 — One toast per outcome

A queued compaction shows the start toast once (saying it is queued behind the current turn when the lane is working)
and the outcome toast once. No check, re-read or settle shows a toast. The lane header shows `queued behind the current
turn` while the compaction waits for its turn, in place of the stage.

## Decision records and events

| Where | New value | Meaning |
| --- | --- | --- |
| autocompact decision detail | `ceiling-overrides-wait (awaiting <names>)` | the ceiling compacted a lane that was waiting |
| autocompact decision detail | `background: <n> kept running` | background work did not hold the gate (any share) |
| compaction trail | `queued: true` | the lines were typed while the lane worked |
| compaction failure | `skipped` stays for `blocked` and for a `needs-idle` kind that is working | unchanged reasons |

## Standards

- **DDD.** `FlightAnswer` becomes a value with `foreground` (count or unknown) and `background` (items); a
  `BackgroundItem` is a tool and a label, both domain types; `WhileWorking` (`queues` or `needs-idle` with its reason)
  joins the compaction plan; the note is built by one domain function.
- **SOLID.** Each reader decides its own split (open for a new kind, closed for the gate); the gate reads only the
  foreground count; the sender types by the plan's capability, not by kind.
- **DRY.** One note builder for D3; one sanitizer; the lease is reused; one confirmation function with the queued rule.

## Risks

- A queued compaction lands at the end of whatever the agent was doing; if that turn was itself the start of long work,
  the compaction runs then, as a manual `/compact` would. Accepted: the ceiling path only fires on a full lane.
- If Claude Code changes how it queues typed input, D4 and D5 would type into the composer without effect; task 0.2's
  live proof is repeated in the release checklist.
