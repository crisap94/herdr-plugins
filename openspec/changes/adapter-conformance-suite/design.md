# Design

## 1. One table, one row per kind

`adapter-conformance.test.ts` builds its rows once, from files it writes under a temporary directory. Each row
holds the real adapter for a kind, three lanes (one placed on an empty source, one on a recorded compaction, one with
nothing to find it by), and the values pinned for the recorded source: `observed`, the compaction marks, and whether
the reader has an in-flight method. Each assertion is a `test` per kind, so a failing kind is named in the output.
The rows use the production constructors and no fake reader, so a refactor that changes a constructor or a method
name shows up here.

Autocompact's in-flight answer is reached through the daemon's own `wireAutocompact`, with the same injected reads
the wiring test uses. The table therefore pins what the user sees (the skip gate and its detail), not the internal
`FlightAnswer` shape, which a refactor is allowed to change.

## 2. The send path is pinned through the flow and the sender

A compactable kind is driven through `Compaction.run`, as the operator's requests are. An unknown kind is not
compactable, so the flow never types into it: its cell drives `Sender` directly, which is the one place anything is
typed. Both use the same fleet fakes (`test/fakes/compaction-fleet.ts`), which record each typed line, each pause and
each event in order. A look at the records reads them four times when they say nothing, so the pauses are counted per
duration rather than per look; the test comments say why. The named test asserts that it polled and that the restore
message follows; the exact pause counts stay in the two tests marked `PINS TODAY:`, so a tuning change fails only those.

The fakes are a deliberate copy of the helpers in `test/compaction.test.ts`, with different names, and that file is not
edited here. The copy is folded into the other in a later change (see tasks.md).

## 3. Pins, not fixes

A pinned oddity is asserted as it is today, with a `PINS TODAY:` comment. The refactor that changes it edits that line
on purpose, and the change is visible in the diff. Nothing is asserted as "correct" that the code does not do.

## 4. Why no Node built-in and no new dependency

The tests use `node:test`, `node:assert`, `node:fs` and `node:os`, as the rest of the suite does. The fakes are plain
TypeScript objects. No runtime code is added, so no package is added either.
