# Tasks

Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing, run from `tab-recap/`.

## 1. Vocabulary

- [x] Add to `tab-recap/CONTEXT.md`: Lane token, Token owner, Compaction request, Typing lease, Note (from
      another tool), Protocol version.
- [x] A test that pins the measured herdr behaviour the design relies on, against a fake host: merged map,
      last write wins, `null` removes, 80-character values.

## 2. The setting (design decision 8)

- [x] `TAB_RECAP_HERDR_EVENTS` (`off` | `on`, default `off`) in the config reader, `config.example.env`, the
      settings modal row "Herdr events" (English and Spanish) and the README.
- [ ] Tests: off by default; `off` writes no lane or event token and ignores requests; `on` → `off` clears
      what was written; leases and `awaiting` are honoured either way.

## 3. Lane tokens (design decisions 1 and 2)

- [x] Write `tab-recap-api`, `tab-recap-share`, `tab-recap-recap` and `tab-recap-needs` through the host port,
      only on change or at half the time to live; clear them when a lane leaves the board.
- [x] Tests: a recap changes `tab-recap-recap` once; no change writes nothing; a closed lane is cleared; no
      name outside `tab-recap-*` and `typing-tab-recap` is ever written.

## 4. Compaction by request token (design decision 3)

- [x] Read `compact-req-<tool>` from `pane.updated`; parse `<id>[:<note>]`; call `requestCompact` with origin
      `request`; answer through `tab-recap-compact`; never act on an id twice.
- [ ] Store and list the origin `request` like `operator` and `auto`.
- [ ] Tests for every scenario of the requirement.

## 5. The typing lease (design decision 4)

- [ ] Take, check and clear `typing-tab-recap` around every typed compaction brief; back off on an earlier
      foreign lease.
- [ ] Tests: an earlier foreign lease defers the brief; an expired lease does not; the lease is cleared after
      typing.

## 6. `awaiting` and notes (design decisions 5 and 6)

- [ ] The in-flight gate counts `awaiting` and `awaiting-<tool>`; skip detail `awaiting <value>`.
- [ ] `note` and `note-<tool>` shown under the lane's header.
- [ ] Tests for both requirements' scenarios.

## 7. The event stream (design decision 7)

- [ ] Write `tab-recap-event` = `<seq>:<kind>[:<detail>]` for every kind in the requirement's table, on the
      lane's pane; daemon start and stop on every workspace; `<seq>` per pane and workspace, base 36 from the
      daemon's start; values cut to 80 characters.
- [ ] Tests: each kind is written once per logged event; skips only on a gate change; the sequence never
      repeats across a restart; a value never exceeds 80 characters.

## 8. Docs

- [ ] README: a "For other tools" section with the token table, the event kinds, the
      one-writer rule, the lease and the version rule.

## 9. Live check

- [ ] On a live daemon with `TAB_RECAP_HERDR_EVENTS=on`, from a scratch client using only `pane.report_metadata` and `events.subscribe`: watch
      the lane tokens change as a recap is written; ask a compaction with `compact-req-probe` and watch
      `tab-recap-compact` reach `done`; hold `typing-probe` and see the brief wait; set `awaiting-probe` and see
      the lane skipped as in flight; follow `tab-recap-event` through a turn, a compaction and a daemon
      restart. Record the event lines here.

## 10. Archive

- [ ] Once every task above is checked and the gates pass, run `openspec archive tab-recap-public-api` in its
      own merge request, as the earlier changes did.
