# `tab-recap/` — a recap column on the right of every tab with a coding agent

**Read [`CONTEXT.md`](CONTEXT.md) first.** It is the vocabulary, and `rules/recap-vocabulary.yml`
rejects its banned synonyms in any identifier. The layering is deliberate: a pure fold,
sum-typed ports, one adapter per port.

## Where things are, and where new work goes

```text
src/recap/domain/       PURE. imports only ./ — no I/O, no text, no adapter (fact · ops: the ledger's fold · grouping · gates/, which may also reach one file up)
src/recap/application/  informer · dispatch · decode · watch-set · recap-job · extract-job (operations, gates, one retry) · ops-answer · ledger-input · replay · excerpt
src/recap/render/       pure text for the column; `badge()` ends in `const exhaustive: never`
src/ports/              interfaces only; every fallible read is a sum type (`Unknown`); the state has one port per aggregate: `RecapRecords`, `Ledger` (the facts), `TabViews`, `ColumnVisibility`, `Requests`, `CompactionRecords` (the daemon writes, the column and the bar read), `Boundaries` (the breaks of a session: the read side; the writes ride the run's transaction), `Retention` (forgetting closed tabs); `LaneSettling` is the wait for herdr's status push
src/adapters/           one implementation per port (one summarizer per harness); ONLY herdr-fleet.ts imports the transport (it hands its wire to `herdr-agents.ts`)
src/adapters/db/        the plugin's own SQLite database: one repository per aggregate (recap records, tab views, column visibility, requests, compaction records), the numbered migrations in schema/, the one-time import of the old JSON files in import/
src/i18n/               PURE catalogs: `Messages` (en, es), the recap's sections, `recapLanguageOf`; `es` is typed as `Messages`
src/extensions/         optional add-ons (notes, warning, upkeep); index.ts is the only registry
src/transport/          herdr's socket wire (one connection per RPC, one per subscription)
src/daemon/             composition root + loop (never exits)
src/column/             composition root of the column pane process
src/setup/              composition root of the settings modal (a popup pane); the state is `recap/application/setup-state.ts`, what it writes `setup-changes.ts` (lock keys + config entries: a new row adds its lines there), the keys `setup-keys.ts`, the view `recap/render/setup.ts`
src/compact/             composition root of the compaction popup (a note, then a request); the reducer is `recap/application/compact-keys.ts`, the flow `compaction.ts`, the words `compaction-message.ts` (pure; never names the plugin)
src/host/               PLAIN JAVASCRIPT (`.mjs` + `.d.mts`, no TypeScript syntax): the host policy (`policy.mjs`: `MIN_NODE`, `supportOf`, the refusal's steps and English text), the Host adapter (`node-host.mjs`) and `launch.mjs`, which every launcher calls
src/*/launch.mjs        the launchers of the column, settings, compaction and daemon (what the manifest and the daemon spawn run, never `main.ts`); `bin/tab-recap.mjs` is the commands'
bin/                    one-shot commands behind the plugin's actions: 0 · 1 · 2 usage · 3 not covered
```

**The domain is a fold**: `(board, observation, instant) → (board, intents)`. Everything the
plugin decides — which tab gets a column, when a column comes back, when a turn ended — is
decided there and tested in `test/fold.test.ts` with no fakes and no timers. Dispatch maps
intents to port calls and decides nothing.

**Adding an intent** is: a member on the `Intent` union → `Dispatch.send` fails to compile
until you handle it → a golden sequence in `test/fold.test.ts`.

**Adding a port** is: the interface in `src/ports/` with a sum-typed result, one adapter, a test.

## Red lines — each is an ast-grep rule with a bad probe it must bite

| rule | says |
| --- | --- |
| `recap-domain-pure` | the domain imports only `./` |
| `recap-domain-pure-gates` | `domain/gates/` imports `./` and `../name.ts` (one file up), nothing else |
| `recap-layers-no-io` | application and render import no `node:` module (but `node:util`, pure text helpers), adapter, transport or composition root |
| `recap-no-foreign-write` | only adapters write files, only under the plugin's state dir; transcripts and any file an extension reads are read-only |
| `recap-transport-boundary` | only `adapters/herdr-fleet.ts` imports the transport |
| `recap-never-types` | no `pane.send_input`/`agent.send_keys`/`pane.input.set`: a recap never types into a lane |
| `recap-prompt-boundary` | `agent.prompt`, `pane.send_text` and `pane.send_keys` are named in ONE module, `adapters/herdr-agents.ts`: the one prompt (codex, opencode) or typed line (claude) of a compaction the operator asked for (`recap/application/compaction.ts`, reached only from the request queue) |
| `recap-sqlite-readonly` | a SQLite database (`DatabaseSync`) is opened `{ readOnly: true }`: opencode's store is the agent's, never ours — only `src/adapters/db/` opens one writable (its own) |
| `recap-write-transactions` | no bare `BEGIN`: a transaction is `writeTx` (`BEGIN IMMEDIATE`, rollback on a throw), in `adapters/db/connection.ts` only |
| `recap-host-probes-at-the-edge` | `process.platform`, `os.platform()`/`os.type()`, `process.env.PATH` only in `src/host/` and the `*-posix`/`*-windows`/`*-xdg` adapters: the rest asks the Host, ProcessControl or ConfigPaths port |
| `recap-vocabulary` | no `summary`, `sidebar`, `panel`, `offset`, `worker` in identifiers |

**A fifth red line is enforced at run time, not by a rule: a recap never closes, resizes or moves a pane that hosts
an agent.** It is checked three times — `adapters/column-panes.ts` (a column is only a pane titled EXACTLY
`tab-recap`/`tab-recap:bar` that hosts no agent and, when herdr reports a label, is labelled `Recap`), the domain
(`fold.ts` never adopts an agent pane as a column and never lets a `close-column` name a lane), and the `HerdrFleet`
edge (`close`/`resize` look the pane up in a fresh snapshot first and refuse with an `Unknown`). There is no
exception: `HerdrFleet` has no `swap` and no `focus` at all, and a phone bar is docked with a split below the
tab's lowest pane — herdr splits only right or down, so the bar sits at the bottom, never on top.

## Three facts about herdr that shaped the code (measured on 0.9.0)

- **One `events.subscribe` per connection.** A second one resets the socket, so a changed watch
  set means a new subscription (subscribe first, snapshot second — a subscription delivers
  changes, never the present).
- **Emitted event names use underscores** (`pane_agent_status_changed`) while subscription
  types use dots; `decode()` accepts both.
- **A split pane has no width at creation.** `pane.resize` moves the divider in ratio units
  (0.5 → 0.6 with `--amount 0.1`), clamped at 0.9 — `domain/layout.ts` computes the one move.
  The pty is a few cells narrower than the layout rect: always ask the tty for its size.

## Gates

```bash
npm install            # tsgo, oxlint (dev only — the plugin itself has zero dependencies)
bash ci/lint.sh        # rules + their probes, vocabulary ↔ CONTEXT.md, tsgo, oxlint, and a seed they must reject
bash ci/test.sh        # node --test
```
