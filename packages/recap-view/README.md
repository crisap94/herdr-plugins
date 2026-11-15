# @stateforge-labs/recap-view

The view model of a recap: what a column, a bar or the modal shows, built from the session ledger.

Status: scaffold. The package is private, at version 0.0.0, and exports its TypeScript source; there is no build step. Every exported file is an empty module until the step that fills it.

| Export | File |
| --- | --- |
| `.` | `src/index.ts` |
| `./unstable/*` | `src/*`, until the view files have their final home |

Checks, from this folder: `bun run typecheck` and `bun test`. `bun run lint` and `bun run test` call `gates/run.sh`, which arrives with the gate runners.

License: MIT, see [LICENSE](LICENSE).
