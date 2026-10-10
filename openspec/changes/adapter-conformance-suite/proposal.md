# Proposal

## Why

Each harness is read and compacted by code spread over several places: transcript readers, the compaction send
path, the autocompact in-flight check, and the eligibility lists. Nothing runs the same expectations over every
kind of agent, so today's behaviour exists only as scattered per-function tests. A later refactor into one adapter
per harness needs something to prove it changed nothing. This change adds that proof first, as tests only.

## What Changes

- **A conformance table.** `tab-recap/test/adapter-conformance.test.ts` has one row per kind of agent that is read
  (claude, codex, opencode, and the screen reader). Every row runs the same assertions: `locate` places a lane or
  says why it cannot and never throws; a read from its own position finds nothing new the second time; `latestPrompt`
  moves no position; `observed` is null for an empty source; the recorded compaction marks; `inFlight` is present
  for claude only, and autocompact says why it stopped for the others.
- **The missing cells.** `tab-recap/test/adapter-conformance-send.test.ts` pins the opencode compaction send path
  (what is typed, in which pieces, the polling, the restore message, no retry) and the named test "every non-Claude
  kind takes the Codex path". The same file covers an unknown kind, driven through the sender directly. The conformance
  table also pins hermes refusing: not compactable, `no reader for hermes` in the recap, and autocompact stopping the
  lane in-flight.
- **Job harnesses.** Every `BACKEND_IDS` id has a maker that names itself; `custom` has no model and no enumerator.
- **Oddities written down.** Each behaviour the audit found odd and that a refactor may change on purpose carries a
  `PINS TODAY:` comment in the test that pins it.

## Out of scope

- No file under `tab-recap/src/` or `tab-recap/bin/` changes. No behaviour changes, and no oddity is fixed here.
- No new seam: the tests use the existing constructors, ports and the daemon's `wireAutocompact`.
- The shared fleet fakes are copied into `tab-recap/test/fakes/compaction-fleet.ts`; the existing
  `compaction.test.ts` keeps its own helpers.
- The archive of this change happens in a follow-up merge request, after this one is live.

## Changelog

This change lands on main through a merge request labelled `changelog::internal`: it changes no shipped behaviour.
