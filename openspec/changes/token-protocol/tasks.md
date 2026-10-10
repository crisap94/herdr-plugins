# Tasks

Paths are under `tab-recap/`. Every group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing. No comments in code;
typed values; one serializer per token.

## 1. Vocabulary

- [ ] 1.1 `CONTEXT.md`: add **Exchange** (a request another tool starts and tab-recap answers, declared once as a
  descriptor), **Ask** (a request tab-recap has taken, recorded until settled), **Capability token** (`tab-recap-x`).
  Verify: the `recap-vocabulary` lint passes.

## 2. The protocol module (pure)

- [ ] 2.1 `src/protocol/primitives.ts`: branded `TokenName` (`[A-Za-z0-9_-]{1,32}`), `TokenValue` (at most 80),
  `RequestId` with two grammars (`legacy-length`, `token-safe`), `ToolName`, `ExchangeVersion`; the herdr limits as one
  constant set. Verify: bound tests (81 characters refused, 33-character name refused).
- [ ] 2.2 `src/protocol/result.ts` (the repository's one `Result<T, E>`) and `src/protocol/codec.ts`: field combinators;
  `parse(serialize(x)) = x` for every field kind. Verify: property-style tests over generated values; a lint probe shows a
  second result union outside `src/protocol/` is reported.
- [ ] 2.3 `src/protocol/exchange.ts` and `registry.ts`: the descriptor type, `EXCHANGES`, the registry build with its checks
  (unique names and prefixes, every value fits, own names per pane at most 10). Verify: one test per refused registry.
- [ ] 2.4 `src/protocol/requester.ts` and `responder.ts`: pure reducers over a token map, an ask ledger and an instant
  (`take`, `answer`, `observe`, `withdraw`), with the foreign-id rule. Verify: trace tests on an in-memory token map with
  the measured fault modes (unchanged rewrite with no event, collapsed burst, time-to-live expiry, clear before take,
  foreign answer, restart mid-flight).
- [ ] 2.5 `src/protocol/capability.ts` and `owners.ts`: the capability value and the derived owner table. Verify: the
  capability value for compact alone is `compact1,kinds1`.
- [ ] 2.6 `rules/recap-protocol-self-contained.yml` with bad and good probes: `src/protocol/` imports only its own files and
  no `node:` module. Verify: `bash ci/lint.sh` shows the bad probe failing.

## 3. Compaction becomes the first exchange

- [ ] 3.1 `src/protocol/exchanges/compact.ts`: the compact descriptor (legacy id grammar, stages, reasons, events).
  `recap/domain/compact-request.ts` and the owner lists in `recap/domain/lane-tokens.ts` are replaced by derivations.
  Verify: compatibility vectors taken from today's `askedOf`/`answerValue`; `test/compact-requests.test.ts` and
  `test/one-writer.test.ts` pass unmodified.
- [ ] 3.2 `recap/domain/event-token.ts`: `EVENT_KINDS` = lane events plus the derived exchange events, same kinds as today.
  Verify: the event-kind table in the lane-tokens spec matches the derived list (test).

- [ ] 3.3 Compaction answers only declared failure reasons: the compact descriptor's `failureReasons` gain `skipped` and
  `busy`; `recap/application/compaction.ts` writes `failed-skipped`, `failed-busy`, or `failed-error` for every other cause
  (free-text agent state included); a blank note is no note and a note is cut to the room its id leaves. Verify: vectors
  carry a skipped, a busy and a free-text-cause case; `observe` reads each as a failure, never `unreadable`.

## 4. One ask ledger (migration 015)

- [ ] 4.1 `src/adapters/db/schema/015-ask-ledger.ts`: `ask` table, copy of `compact_ask` as settled `compact` asks, drop of
  `compact_ask`. Verify: a migration test from a real 014 database with rows (every seen id kept, none interrupted).
- [ ] 4.2 `src/ports/ask-ledger.ts` and `src/adapters/db/ask-ledger.ts` (replacing `ask-records.ts`): `seen`, `record`
  (with `ref`), `settle`, `unfinished`, `prune` (30 days, never an unsettled ask). Verify: one contract test run against
  SQLite and the in-memory double, including a local requester `cli` and an exchange with no descriptor, and an old unsettled
  ask that pruning keeps.
- [ ] 4.3 Restart: every unfinished ask is handed to its answer channel as `failed-interrupted` (token answer for a token
  exchange; the flow's answer record for a local requester); a request joined to a running compaction is settled with that
  compaction's outcome. Verify: restart tests with a queued ask, a running ask, a joined ask (answered `failed-interrupted`,
  never left `queued`) and a local requester's ask (no token written).
- [ ] 4.4 An ask taken while the protocol is off is recorded and settled `off` in the same step and never answered; the
  settle match is (exchange, id, pane). Verify: a test takes a request while off, restarts, and finds no answer token and no
  `failed-interrupted`; a test settles two same-id asks from two requesters with one answer.

## 5. Level-triggered consideration and the capability token

- [ ] 5.1 The informer considers request tokens on every read of a pane's map (frame, snapshot after subscribe, resync).
  Verify: a request rewritten with no event is taken at the next resync.
- [ ] 5.2 The lane token publisher writes `tab-recap-x` with the lane tokens when sharing is on and clears it when off.
  Verify: lane-token tests for publish, unchanged and clear.

## 6. Published contract

- [ ] 6.1 `protocol/vectors/*.json` (valid and invalid values per exchange, traces with expected observations, compat
  vectors, the registered agent kinds, each descriptor's timing constants) and `protocol/MANIFEST` (file and SHA-256,
  generated by `bin/protocol-manifest.ts`). Verify: a test regenerates the manifest and fails on drift; a test pins the
  vectors' kinds list to the registered-kind table (adding a kind without raising `kinds<version>` fails).
- [ ] 6.2 `README.md` "For other tools": the token protocol, the capability token, the unauthenticated nature, how to carry
  a verbatim copy and check it against the manifest. Verify: `bash ci/lint.sh` passes.

## 7. Archive

- [ ] 7.1 `openspec archive token-protocol` in the implementation merge request, once every other task is checked and the
  gates pass. Verify: `openspec validate --specs --strict` passes after the archive.
