# agent-sdk-session-ledger — vocabulary

The host library that connects the Claude agent SDK to the session ledger. Its own terms are written here by the step that gives
each of them code.

## Import boundary

`src/` imports only:

- `@stateforge-labs/session-ledger` (the root export; its test kit is for `test/` and `testkit/`),
- `@stateforge-labs/session-ledger-sqlite` (the root export and `/driver`): the store mechanism under `src/store/`,
- `@stateforge-labs/harness-adapters` (the root export, `/claude` and `/jsonl`): the transcript reader,
- a type-only import (`import type`) of `@anthropic-ai/claude-agent-sdk`,
- relative paths that stay inside `src/`.

`src/` never names `tab-recap/` or `claude-code/`. The rule is `rules/sdk-host-boundary.yml`; its bad probe is
`rules/probes/sdk-host-boundary/bad.ts` and its good probe is `rules/probes/sdk-host-boundary/good.ts`.

## The store file

`src/store/` is this library's own row store: `Records` and `FactStore` over `openStore`, with its own migration history
(`src/store/history.ts`). Its version numbers are not those of the tab-recap plugin. The path is a required argument of
`openLedgerStore`; it has no default, it is never the plugin's `tab-recap.db`, and the file is opened as `owner`. A file from a
newer library is returned as `newer-store`, and one too old to migrate as `stale-store`; neither is thrown. The compaction marks kept for a scope come back oldest first. The suggested place is
`$XDG_STATE_HOME/agent-sdk-session-ledger/ledger.db`.

## The composition

`createLedgerEngine` (`src/ledger-engine.ts`) builds the engine the host library takes: it opens the store at the required `path`, adds a
Claude reader (`src/claude-reader.ts`) and the `Writer` the caller brings, and returns `{ kind: 'ready', engine, close }`. A newer or
stale file comes back as `newer-store` or `stale-store`, never thrown. The library holds no model backend: the caller's `Writer` is the
only way a recap is written. The reader finds a transcript by session id under `transcriptsRoot` (default the Claude projects folder),
reads it through `harness-adapters`, and returns an Unknown (`not-found`, `unreadable`) instead of throwing. It keeps no in-flight state,
context use or tail cache. Ids come from `globalThis.crypto.randomUUID()` because `src/` imports no `node:` module. Left unset on
purpose: stories, the enumerator, the curator, every optional setting and the event listener.
