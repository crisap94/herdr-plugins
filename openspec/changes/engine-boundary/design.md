# Design: cut the engine boundary in place, with no behaviour change

## Context

| Fact | Where |
| --- | --- |
| The recap path starts at `RecapJob` (`request`, `refreshNow`); its import closure is about 93 files | `src/recap/application/recap-job.ts` |
| `recap-job.ts:2` and `ports/recap-records.ts:2` import `RecapCause` from `domain/intent.ts`, which pulls the fold's board and intents into the closure | `src/recap/domain/intent.ts` |
| The ledger's history is read through `Ledger.historyOf` | `src/ports/ledger.ts` |
| Replay already runs the recap path with no herdr | `src/recap/application/replay.ts`, `bin/replay.ts` |
| A scratch store and a recorded transcript exist for tests | `src/adapters/db/scratch.ts`, `test/fixtures/replay-claude.jsonl`, `test/fixtures/claude-compact-boundary.jsonl` |
| A manifest read by the module graph, with a test that the manifest equals what it lists, already exists | `ci/brand-importers.json`, `.dependency-cruiser.cjs`, `test/brand-importers.test.ts` |
| Gates name files by path: work lanes, per-lane baselines and exceptions, released migrations | `ci/lanes.json`, `ci/domain-types-baseline/`, `ci/domain-types-exceptions/`, `ci/check-migrations.sh` |
| Other work is in flight in the same folders: Phase B of `domain-type-gates`, `gui-port`, the harness-adapters upgrade | `openspec/changes/` |

## Decisions

### D1. Cut in place, by a manifest and a dependency rule, not by moving files

Moving the engine's files into a package would change every path the gates name: `ci/lanes.json` gives each file to a work
lane, the baselines and exceptions are keyed by path, and released migrations are frozen byte for byte by path. Every branch in
flight that edits those files would have to be rebased onto the move. A manifest and one graph rule draw the same line with no
path changing: `ci/engine-files.json` lists the engine's files, and `engine-self-contained` in `.dependency-cruiser.cjs` fails when
a listed file imports one that is not listed (`node:util` is the one other module allowed). A test, modelled on
`test/brand-importers.test.ts`, asserts that the manifest equals the closure computed from `recap-job.ts`, so the list cannot
drift. The physical move is a later change, once the line has held.

### D2. The vocabulary is an alias at the facade only

| Engine term | Means | In herdr today |
| --- | --- | --- |
| Engine | the host-independent core | (new) |
| Scope | sessions followed together; the unit of one ledger | Tab |
| Followed session | one agent conversation the engine reads | Lane |
| Host | the program that reports events to the engine | the daemon |

The engine's own files keep their names. Only the facade speaks the engine's words, and maps them to `TabId` and `Lane` in one
place. Prompts, the DTD, SQL columns and stored values keep saying tab and lane, so the writer sees the same bytes and the store
holds the same values. "Host" is already a noun in `CONTEXT.md` (the machine and runtime); the row is extended with the engine's
sense rather than given a second row, and the two senses are told apart there.

### D3. The facade

`src/recap/application/engine.ts`:

```ts
createEngine({ source, store, models, environment, settings, ran? }): Engine
```

| Method | Is today |
| --- | --- |
| `turnEnded(scope, sessions, cause)` | `RecapJob.request` |
| `refresh(scope, sessions)` | `RecapJob.refreshNow` |
| `sessionStarted(scope, sessions)` | `refresh` |
| `compacted(scope, sessions)` | `refresh`; the reader already finds the boundary from the records |
| `history(scope, session)` | `Ledger.historyOf` |

It returns facts, not text: rendering stays out of the core. Consumers in the daemon take `Pick<Engine, ...>` of what they use, so
`RecapJob` is constructed in one place.

### D4. Behaviour is pinned before anything moves

The first code step adds `test/engine-golden.test.ts`: it replays `test/fixtures/replay-claude.jsonl` with a fake summarizer and
the scratch store, and snapshots the writer's input bytes and the resulting facts. Every later step must leave that snapshot
unchanged; a step that needs to change it is a behaviour change and out of scope.

### D5. Narrow leaks rather than widen the engine

`RecapCause` moves to `src/recap/domain/recap-cause.ts` and `intent.ts` re-exports it, so in-flight branches keep compiling while
`board.ts` and `intent.ts` leave the closure. If `ports/screens.ts` is reached through `ports/transcript-registry.ts`, the engine's
source narrows to `readerFor(agent)`, and the screen fallback stays on the host side.

`ports/screens.ts` was reached through `recap-input.ts` (its `isScreenSource`), not through the registry; the prefix moved to
`ports/transcript-source.ts` instead, and the registry stays as it is. Three files the closure still holds are herdr's lane model,
not engine material: `domain/lane.ts` (a lane with its pane, tab and workspace), `domain/status.ts` (herdr's agent status) and
`domain/ids.ts` (`PaneId`, `TabId` and `WorkspaceId` beside the session ids). Cutting them means retyping the job's inputs, which
is the facade's work (D2, D3). Until then `ci/engine-files.json` lists them apart from `engine`, under
`herdrLaneModelUntilTheFacadeSpeaksScopeAndFollowedSession`, so the debt is visible; the rule treats both lists as one.

## Order

Each step is its own small merge request and ends with the gates passing. Steps 3 and 4 touch the same folders as Phase B of
`domain-type-gates`, so they stay as small as possible and rebase per lane. The guard (step 5) merges early, so other branches
that add an import to an engine file are told by the build.

## Risks

- `ports/unknowable.ts:39` says "pane". The string stays; a test pins it.
- `RecapJob` waits 2.5 s to settle before a run, so a short-lived process must call `refresh`, not `turnEnded`.
- The closure counted by hand (about 93 files) may differ from the computed one; the manifest test is the authority.

## Hand-written pieces kept

The closure test walks imports with dependency-cruiser, already a devDependency and the repository's one source for import
boundaries; no Bun or Node built-in resolves `#src/*` imports into a graph. The facade is a thin mapping over existing classes;
nothing else is hand-written.
