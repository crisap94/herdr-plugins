# Design

## Registry boundary

- `agent-kinds.ts` is a pure domain table with explicit boolean capabilities for each registered kind.
- `AgentKind` is the key union derived from that table; the domain does not import adapters.
- The transcript `READERS` table satisfies `Record<AgentKind, ...>`, so every domain kind has a reader.
- The three eligibility lists are filtered from the same capability entries.
- Replay parses its optional kind string with `readerKindOf` before exact reader lookup.
- The table holds product-specific policy; no Node built-in can provide these declarations.

## Verification

The tests pin the current lists and check that each entry has all three boolean capabilities. A temporary mutation of one capability must fail the list golden.
