# Tasks

Paths are under `tab-recap/` unless stated otherwise. Each implementation group ends with `bash ci/lint.sh` and
`bash ci/test.sh` passing. Every code merge request ticks its own boxes and names itself on the line.

## 0. Live proofs (scratch workspace, throwaway Claude agents, evidence in the merge request)

- [x] 0.1 (INT) Prove that Claude Code keeps a background shell (`run_in_background: true`), a `Monitor` and a background
      `Agent` running across `/compact`, and still delivers each end notice after it. Record the Claude Code version, the
      commands, and the transcript lines of the launch, the compaction mark and the end notice. Until this passes, Claude's
      reader keeps every item as foreground (spec: "Background work that survives a compaction does not hold a lane").
- [x] 0.2 (INT) Prove that `/compact <guidance>` typed into a working Claude agent (through `herdr agent prompt` while a
      long shell command runs) is kept, runs as the compaction after the turn ends, and writes one compaction mark after
      the typing instant. Record the version, the typing instant, the turn end and the mark. Until this passes, Claude's
      plan says `needs-idle` (spec: "Each kind says whether a compaction can be queued").
- [x] 0.3 (INT) Prove that the brief writer keeps the note of an automatic compaction (`Still waiting for: …`) in the guidance
      it writes, for a note of 400 characters. The 400-character cap is UNMEASURED until then; if the note is dropped or
      cut, record the length kept and set the cap to it.

## 1. Domain (written first, by the change's owner; lanes start once it and the gates are in)

- [x] 1.1 (!103) `FlightAnswer` becomes a value with `foreground` (count or unknown) and `background` (a list of
      `BackgroundItem`: a tool and a label, both domain types). The gate (`gateOf` in `src/recap/domain/autocompact.ts`)
      reads only `foreground`.
- [x] 1.2 (!103) `WhileWorking` (`queues` or `needs-idle` with its reason) joins the compaction plan type.
- [x] 1.3 (!103) One domain function builds the note `Still waiting for: <names>. Still running: <tool> "<label>", …` from the
      awaited names and the background items, through the existing plain-text sanitizer, cut to 400 characters (task 0.3),
      and returns no note when there is nothing to name.
- [x] 1.4 (!103) Verify: unit tests for the note (both parts, one part, nothing, the cut), for the gate reading only
      `foreground`, and for `WhileWorking` refusing an empty reason.

## 2. Lane A: in-flight readers (`src/adapters/*-in-flight.ts`)

- [x] 2.1 (!106) Claude's reader returns its items as background items, with the launch's `description` as label (the tool name
      when none), behind a switch that stays off until 0.1 passes; off, it returns them as foreground, as today.
- [x] 2.2 (!106) Codex and opencode readers return all work as foreground and name why in their capability.
- [x] 2.3 (!106) Verify: `test/claude-in-flight.test.ts`, `test/claude-in-flight-reach.test.ts`, `test/codex-in-flight.test.ts`,
      `test/opencode-in-flight.test.ts` gain the split and the labels.

## 3. Lane B: the autocompact gate (`src/recap/application/autocompact.ts`)

- [x] 3.1 (!105) `flightOf` reports the awaited reply apart from foreground work; at or above the ceiling it does not hold the
      gate, in `gated` and in the late check in `waitSkipped`, and the decision detail is
      `ceiling-overrides-wait (awaiting <names>)`. Below the ceiling it holds as before.
- [x] 3.2 (!105) Background work never holds the gate; a decision it did not hold records `background: <n> kept running`.
- [x] 3.3 (!105) The automatic request carries the note of 1.3 in place of `null` when there is something to name; a requested
      compaction keeps its own note.
- [x] 3.4 (!105) The coverage backoff still yields to the ceiling, and the in-flight gate with the ceiling rule applies first.
- [x] 3.5 (!105) Verify with the fake world in `test/autocompact-world.ts`: the scenarios "A full lane waits for two others",
      "Below the ceiling it still waits", "A foreground call is not cut", "A monitor keeps running", "Before the live
      check", and "The note after a full lane compacts", in `test/autocompact-skips.test.ts` and
      `test/autocompact-races.test.ts`.

## 4. Lane C: queued compactions (`src/recap/application/compaction*.ts`, `src/adapters/compaction-plan-registry.ts`)

- [x] 4.1 (!107, INT) The plans declare `WhileWorking`: Codex and opencode `needs-idle` (`queued input is not measured for this
      kind`); Claude `needs-idle` until 0.2 passes, then `queues`.
- [x] 4.2 (!107) `refusalOf` and `refused` refuse `working` only for a `needs-idle` plan; `blocked` is refused at both checks and
      right before typing; an unknown status fails as today. The sender types through the existing typing lease.
- [x] 4.3 (!107) The trail records `queued: true` when the lines were typed while the agent worked; the lane shows `queued behind
      the current turn`; one start toast and one outcome toast, none per check or settle.
- [x] 4.4 (!107) `outcomeOf` (`compaction-outcome.ts`) for a queued compaction re-reads the marks at each settle and confirms only
      on a mark after the typing instant, within the existing 10-minute bound; the retry is typed only after a `failed`
      mark.
- [x] 4.5 (!107) Verify: `test/compaction.test.ts`, `test/compaction-outcome.test.ts`, `test/compaction-plans.test.ts`,
      `test/compaction-stage.test.ts`, `test/one-compaction-per-lane.test.ts` and `test/typing-lease.test.ts` cover
      "Agent mid-turn", "Agent mid-turn, a kind that queues", "Agent waits on a question", "The agent wakes while the brief is written",
      "The turn ends before the compaction", "No mark within the bound" and "A joined request for a refused agent".

## 5. Integration

- [x] 5.1 (INT) Turn on the switches of 2.1 and 4.1 only for the proofs that passed (0.1, 0.2), each in its own merge request
      citing the evidence.
- [ ] 5.2 Live check on a scratch workspace: a Claude lane above the ceiling with an `awaiting` token and a running
      `Monitor` is compacted, its note names both, the monitor's next event and the awaited reply reach it after.
- [x] 5.3 (INT) Add the 0.2 proof to the release checklist, so a Claude Code update that stops queuing typed input is caught.
- [x] 5.4 (INT) Run strict OpenSpec validation from the repository root, and `bash ci/lint.sh` and `bash ci/test.sh` from
      `tab-recap/`.

## 6. Archive

- [ ] 6.1 Archive `autocompact-ceiling-over-in-flight` in its own merge request after all tasks and gates pass.
