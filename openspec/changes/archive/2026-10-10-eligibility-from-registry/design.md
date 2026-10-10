# Design

## Registry boundary

`registered-kinds.ts` owns `REGISTERED_KINDS` and its closed `RegisteredKind` key union in the domain. Adding a kind takes two compiler-linked edits: one capability row in this domain table and one reader line in the adapter table, because the domain must not import adapters. `satisfies Record<RegisteredKind, ...>` forces both tables to cover each other, and the capability type requires every capability on every row. A screen-only harness such as hermes cannot be registered today because every registered kind needs a transcript reader; later harness adapters must account for that.

The three eligibility lists are filtered from the table's corresponding capabilities. Replay parses its optional kind string with `readerKindOf` before exact reader lookup.

## Verification

The tests pin the current lists, check each entry's three boolean capabilities and exercise each derivation against a synthetic table with distinct capabilities. Call-site wiring of `COMPACTABLE` and `DEFAULT_POLICY.kinds` to each other's capability is not distinguishable while their real values are equal.
