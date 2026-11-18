# agent-sdk-session-ledger — vocabulary

The host library that connects the Claude agent SDK to the session ledger. Its own terms are written here by the step that gives
each of them code.

## Import boundary

`src/` imports only:

- `@stateforge-labs/session-ledger` (the root export; its test kit is for `test/` and `testkit/`),
- a type-only import (`import type`) of `@anthropic-ai/claude-agent-sdk`,
- relative paths that stay inside `src/`.

`src/` never names `tab-recap/` or `claude-code/`. The rule is `rules/sdk-host-boundary.yml`; its bad probe is
`rules/probes/sdk-host-boundary/bad.ts` and its good probe is `rules/probes/sdk-host-boundary/good.ts`.
