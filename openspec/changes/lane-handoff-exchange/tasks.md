# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing. No comments in code;
typed values; one serializer per token. Build after `token-protocol`, `lane-handoff` and `lane-handoff-retention`.

## 1. Vocabulary and settings

- [ ] 1.1 `CONTEXT.md`: add **Handoff exchange** (the second exchange of the token protocol) and **Deadline** (the longest
  time from `queued` to a terminal stage). Verify: the `recap-vocabulary` lint passes.
- [ ] 1.2 `daemon/config.ts`: `TAB_RECAP_HANDOFF_REQUESTS` parsed once (`on` exactly, else `off`), effective only with
  sharing on. Verify: a config test for unset, `on`, `On`, `yes`, and `on` with sharing off.

## 2. The descriptor

- [ ] 2.1 `src/protocol/exchanges/handoff.ts`: id (token-safe), target (pane identifier, one colon), optional `refresh`,
  stages and terminal families, the refusal reasons of the exchange (`not-offered`, `bad-request`, `not-a-lane`,
  `target-elsewhere`), events, opt-in setting, version 1, and `deadline-ms` declared as 150 000.
  Verify: round-trip and refused-value vectors; the longest name is 32 characters and the longest answer fits 80.
- [ ] 2.2 Register it in `EXCHANGES`; the capability value lists `handoff1` only when enabled. Verify: the registry build
  passes with 9 own names per pane; a capability test with the setting on and off.
- [ ] 2.3 A test outside the protocol module pins `deadline-ms` to slice 1's `HANDOFF_DEADLINE_MS` and the equation
  `HANDOFF_DEADLINE_MS = HANDOFF_TAKE_MAX_AGE_MS + HANDOFF_FLOW_MAX_MS`. Verify: changing either side fails the test.
- [ ] 2.4 Run the handoff descriptor through the token protocol's shared descriptor conformance suite. Verify: the suite
  lists the handoff descriptor and passes.

## 3. Responder and mirror

- [ ] 3.1 `recap/application/handoff-exchange.ts`: the checks before queueing (not offered, bad request, not a lane,
  target elsewhere) answered on the token only with no row written, the ask record (requester's tool and id, source pane,
  the queued row's `HandoffId` as local record; no `cli` ask for this row), and the queued row through `HandoffRequester`
  with the requester's id and no note.
  Verify: one test per check on an in-memory token map, a repeat after a restart, and a rewrite announced by no event.
- [ ] 3.2 The mirror: `running` when the flow takes an exchange row, then the terminal stage from the answer row by one
  total function over the outcome table, the ask found by `HandoffId` and settled in the answer row's transaction, the
  events written on the source and target panes. Verify: a mapping test over every storable outcome and reason, an event
  test for both panes, a too-late row answered `failed-expired`, and a restart test (`failed-interrupted` on the source pane
  only).
- [ ] 3.3 Keep the exchange's refusal reasons out of slice 1's outcome table. Verify: a test asserts the outcome table is
  unchanged by this change and every descriptor refusal maps to one answer value within 80 characters.

## 4. Red lines and docs

- [ ] 4.1 `rules/recap-prompt-boundary.yml` and `rules/recap-never-types.yml`: messages name the three entry points; probes
  updated; red-line rows in `CLAUDE.md` and `README.md` updated. Verify: `bash ci/lint.sh` shows each bad probe failing.
- [ ] 4.2 `README.md` "For other tools": the handoff exchange, its grammar, the deadline, the settings, the
  unauthenticated nature. `config.example.env`: the new setting. Verify: `bash ci/lint.sh` passes.

## 5. Real herdr

- [ ] 5.1 With sharing on and the setting on, a second shell writes `handoff-req-<tool>` on a source lane's pane naming a
  fresh idle lane; record the stages and events and that the handoff is delivered once. With the setting off, the same
  request is answered `refused-not-offered`. Evidence without content or secrets. Verify: the stage sequence and the pane
  identifier format seen are recorded and linked from the merge request.

## 6. Archive

- [ ] 6.1 `openspec archive lane-handoff-exchange` in the implementation merge request after slices 1 and 2 are archived,
  once every other task is checked and the gates pass. Before it, re-sync the restated requirements (`Delivery is leased`,
  `Sharing on herdr is a setting`, `The plugin's own events`) against the archived text;
  the diff SHALL show only this change's additions. Verify: `openspec validate --specs --strict` passes after the archive.
