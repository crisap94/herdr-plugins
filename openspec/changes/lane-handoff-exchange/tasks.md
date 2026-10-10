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
  stages and terminal families, events, opt-in setting, version 1, `deadline-ms` derived from the handoff constants.
  Verify: round-trip and refused-value vectors; the longest name is 32 characters and the longest answer fits 80.
- [ ] 2.2 Register it in `EXCHANGES`; the capability value lists `handoff1` only when enabled. Verify: the registry build
  passes with 9 own names per pane; a capability test with the setting on and off.
- [ ] 2.3 A test pins `deadline-ms` to `HANDOFF_WAIT_REFRESH_MS` and the row maximum age to `HANDOFF_ROW_MAX_AGE_MS`.

## 3. Responder and mirror

- [ ] 3.1 `recap/application/handoff-exchange.ts`: the checks before queueing (not offered, bad request, not a lane,
  target elsewhere), the ask record, and the queued row through `HandoffRequester` with the requester's id and no note.
  Verify: one test per check on an in-memory token map, a repeat after a restart, and a rewrite announced by no event.
- [ ] 3.2 The mirror: `running` when the flow takes an exchange row, then the terminal stage from the answer row by one
  total function over the outcome table, the ask settled, the events written on the source and target panes. Verify:
  a mapping test over every storable outcome and reason, and an event test for both panes.
- [ ] 3.3 Add `not-offered`, `bad-request` and `target-elsewhere` to the outcome table (storable `refused` reasons) with en
  and es catalog keys. Verify: the catalog-key test and the answer repository accept them with no migration.

## 4. Red lines and docs

- [ ] 4.1 `rules/recap-prompt-boundary.yml` and `rules/recap-never-types.yml`: messages name the three entry points; probes
  updated; red-line rows in `CLAUDE.md` and `README.md` updated. Verify: `bash ci/lint.sh` shows each bad probe failing.
- [ ] 4.2 `README.md` "For other tools": the handoff exchange, its grammar, the deadline, the settings, the
  unauthenticated nature. `config.example.env`: the new setting. Verify: `bash ci/lint.sh` passes.

## 5. Real herdr

- [ ] 5.1 With sharing on and the setting on, a second shell writes `handoff-req-<tool>` on a source lane's pane naming a
  fresh idle lane; record the stages and events and that the handoff is delivered once. With the setting off, the same
  request is answered `refused-not-offered`. Evidence without content or secrets.

## 6. Archive

- [ ] 6.1 `openspec archive lane-handoff-exchange` in the implementation merge request after slices 1 and 2 are archived,
  once every other task is checked and the gates pass. Before it, re-sync the restated requirements (`Delivery is leased`,
  `Handoff outcome is a closed sum`, `Sharing on herdr is a setting`, `The plugin's own events`) against the archived text;
  the diff SHALL show only this change's additions.
