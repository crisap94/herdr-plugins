# @stateforge-labs/session-ledger-sqlite

The SQLite store of the session ledger: records and facts kept in one SQLite file.

Status: scaffold. The package is private, at version 0.0.0, and exports its TypeScript source; there is no build step. Every exported file is an empty module until the step that fills it.

| Export | File |
| --- | --- |
| `.` | `src/index.ts` |
| `./driver` | `src/driver.ts` |
| `./testkit` | `testkit/index.ts` |

Checks, from this folder: `bun run typecheck` and `bun test`. `bun run lint` and `bun run test` call `gates/run.sh`, which arrives with the gate runners.

License: MIT, see [LICENSE](LICENSE).
