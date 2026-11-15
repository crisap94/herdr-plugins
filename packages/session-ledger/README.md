# @stateforge-labs/session-ledger

The engine contract of tab-recap: the types and the few values that a host, a store and a view code against.

Status: scaffold. The package is private, at version 0.0.0, and exports its TypeScript source; there is no build step. Every exported file is an empty module until the step that fills it.

| Export | File |
| --- | --- |
| `.` | `src/index.ts` |
| `./compaction-timing` | `src/compaction-timing/index.ts` |
| `./testkit` | `testkit/index.ts` |
| `./unstable/*` | `src/*`, until the engine move is finished |

Checks, from this folder: `bun run typecheck` and `bun test`. `bun run lint` and `bun run test` call `gates/run.sh`, which arrives with the gate runners.

License: MIT, see [LICENSE](LICENSE).
