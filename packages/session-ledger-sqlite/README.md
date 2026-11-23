# @stateforge-labs/session-ledger-sqlite

The SQLite store of the session ledger: records and facts kept in one SQLite file.

Status: the store mechanism. The package is private, at version 0.0.0, and exports its TypeScript source; there is no build step. `openStore` opens a SQLite file for a role with a required migration history, and answers a store, a newer store or a stale store.

| Export | File |
| --- | --- |
| `.` | `src/index.ts` |
| `./driver` | `src/driver.ts` |
| `./unstable/*` | `src/*` |
| `./testkit` | `testkit/index.ts` |

Checks, from this folder: `bun run typecheck` and `bun test`. `bun run lint` and `bun run test` call `gates/run.sh`, which arrives with the gate runners.

License: MIT, see [LICENSE](LICENSE).
