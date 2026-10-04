# `tab-recap/` — a recap column on the right of every tab with a coding agent

**Read [`CONTEXT.md`](CONTEXT.md) first.** It is the vocabulary, and `rules/recap-vocabulary.yml`
rejects its banned synonyms in any identifier. The layering is deliberate: a pure fold,
sum-typed ports, one adapter per port.

## Where things are, and where new work goes

```text
src/recap/domain/       PURE. imports only ./ — no I/O, no text, no adapter
src/recap/application/  informer · dispatch · decode · watch-set · recap-job · excerpt
src/recap/render/       pure text for the column; `badge()` ends in `const exhaustive: never`
src/ports/              interfaces only; every fallible read is a sum type (`Unknown`)
src/adapters/           one implementation per port (one summarizer per harness); ONLY herdr-fleet.ts imports the transport
src/i18n/               PURE catalogs: `Messages` (en, es), the recap's sections, `recapLanguageOf`; `es` is typed as `Messages`
src/extensions/         optional add-ons (notes, warning, upkeep); index.ts is the only registry
src/transport/          herdr's socket wire (one connection per RPC, one per subscription)
src/daemon/             composition root + loop (never exits)
src/column/             composition root of the column pane process
src/setup/              composition root of the settings modal (a popup pane); the keys are `recap/application/setup-keys.ts`, the view `recap/render/setup.ts`
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
| `recap-layers-no-io` | application and render import no `node:`, adapter, transport or composition root |
| `recap-no-foreign-write` | only adapters write files, only under the plugin's state dir; transcripts and any file an extension reads are read-only |
| `recap-transport-boundary` | only `adapters/herdr-fleet.ts` imports the transport |
| `recap-never-types` | no `send_keys`/`send_text`/`send_input`/`agent.prompt`: a recap never types into a lane |
| `recap-vocabulary` | no `summary`, `sidebar`, `panel`, `offset`, `worker` in identifiers |

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
