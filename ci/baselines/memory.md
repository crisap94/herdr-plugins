# Memory baseline (M0)

Measured on 2026-11-13 on the owner's machine, against the installed tab-recap 3.0.2: commit `d81bb763fb28fd4184970a0de646c54f126ad4a4` ("tab-recap: release 3.0.2", tag `tab-recap-v3.0.2`; same tree as main `1678ba350f985ced3b247502db8296bfa8a273c3`). Bun 1.4.4, Linux.

The machine module list for M1 is `memory.json` next to this file.

## How it was measured

```
ps -o rss= -p <pid>
awk '/^Pss:/{print $2}' /proc/<pid>/smaps_rollup
awk '/^SwapPss:/{print $2}' /proc/<pid>/smaps_rollup
cat ~/.local/state/herdr/plugins/tab-recap/daemon.pid
pgrep -f '^bun src/column/launch.mjs'
```

- Daemon: the pid in `<state>/daemon.pid` (`tab-recap/src/adapters/os/pidfile.ts:17`). It had no child processes at any sample.
- Column panes: the processes `bun src/column/launch.mjs`. `pgrep -f src/column/main.ts` matches nothing, because the launcher loads `main.ts` with `import()`.
- Tabs: 1, 5 and 10 scratch tabs, each with an idle Claude agent. The owner's own 5 tabs also had columns, so the plugin ran 6, 10 and 15 columns at the three points.
- Each point was sampled twice, 30 s apart, 15 to 30 s after the last column opened.
- Machine condition: 29.7 GB RAM with 1.8 GB free and 17.9 GB of swap in use. By the 10-tab point older processes had pages swapped out (daemon SwapPss 12.6 MB, the first six columns 4 to 15 MB each), so RSS and Pss under-count there. The last row adds SwapPss.

## Table (kB)

| Point | Sample | Columns | Daemon RSS | Daemon Pss | Column Pss mean (min to max) | Column RSS mean | Sum Pss of all plugin processes | Sum Pss + SwapPss |
|---|---|---|---|---|---|---|---|---|
| 1 scratch tab | 16:56:15 | 6 | 114832 | 77918 | 45840 (44877 to 47007) | 81038 | 352960 | n/a |
| 1 scratch tab | 16:56:45 | 6 | 114884 | 81000 | 48424 (46216 to 50252) | 82626 | 371548 | n/a |
| 5 scratch tabs | 16:57:40 | 10 | 116252 | 80398 | 44430 (38669 to 55390) | 79953 | 524704 | n/a |
| 5 scratch tabs | 16:58:11 | 10 | 119900 | 83454 | 43367 (40967 to 46178) | 79136 | 517125 | n/a |
| 10 scratch tabs | 16:59:11 | 15 | 105828 | 66810 | 36827 (28975 to 42315) | 73373 | 619224 | n/a |
| 10 scratch tabs | 16:59:41 | 15 | 103104 | 62612 | 35894 (28455 to 42773) | 72757 | 601036 | n/a |
| 10 scratch tabs | 16:59:52 | 15 | 103036 | 62744 + 12592 swap | 36280 (28664 to 46300) | 73037 | 606956 | 704736 |

## Sum

The sum of Pss over all plugin processes (daemon plus every column) is 353 to 372 MB with 6 columns, 517 to 525 MB with 10 and 601 to 619 MB with 15 (705 MB with SwapPss).

Read without swap effects: one column costs about 40 to 46 MB Pss (75 to 82 MB RSS, about 38 MB of it shared clean); the daemon costs about 78 to 83 MB Pss (115 to 120 MB RSS) and barely grows with the tab count. Each added tab adds one column, so about 40 to 46 MB of Pss.

## Floors (one process each)

| Subject | How started | RSS kB | Pss kB |
|---|---|---|---|
| Bun floor | `bun -e 'setInterval(()=>{},1e9)'` | 14552 / 14616 | 2428 / 2431 |
| Bun with `node:net` only | `bun -e 'require("node:net"); setInterval(()=>{},1e9)'` | 21212 / 21620 | 4549 / 4583 |
| The same through the host launcher | a two-line `.mjs` that calls `launch('pane', <script>)` of `tab-recap/src/host/launch.mjs` on a script that only requires `node:net` | 24588 / 24896 | 5797 / 5853 |
| Non-Bun floor | `socat - UNIX-CONNECT:<socket>` | 5212 | 1043 |

## Start-up module trace

`src/daemon/main.ts` cannot be imported without starting a second daemon. Each of its 55 value imports was imported into a fresh Bun process, and all of them cumulatively into one process, heavy ones first, recording `require.cache`, the module count, the import time and Pss after `Bun.gc(true)`.

Cumulative, in one process: 1474 modules, +50.7 MB Pss over a 5.5 MB start, 526 ms (warm transpile cache).

| Specifier (first to pull it in) | Pss added | Modules after | Main packages it brings |
|---|---|---|---|
| `@stateforge-labs/harness-adapters/runtime` (`main.ts:69`) | +24.4 MB | 375 | the runtime (cold first run 1072 ms) |
| `#src/adapters/transcripts/registry.ts` (`main.ts:3`) | +9.1 MB | 802 | `@stateforge-labs/harness-hooks` (174 files), `zod` (95), harness-adapters (40) |
| `./state.ts` (`main.ts:42`) | +9.0 MB | 1081 | `drizzle-orm` (110) |
| `#src/adapters/git/lane-repo.ts` (`main.ts:7`) | +4.0 MB | 468 | `isomorphic-git`, `pako` and about 40 small shims (93 modules) |
| `#src/adapters/frontend.ts` | +2.9 MB | 1255 | rest of `@stateforge-labs/herdr-sdk` |
| `#src/adapters/herdr/fleet.ts` | +1.1 MB | 1146 | `@stateforge-labs/herdr-sdk` (43) |
| `./backends.ts` | +1.0 MB | 1431 | more harness-adapters files (88 in total) |
| everything else (48 specifiers) | under 0.4 MB each | | tab-recap's own code |

## Heavy modules for M1

`memory.json` lists one heavy module, `@stateforge-labs/harness-adapters/runtime`. It is reached from `main.ts` only through `main.ts:69` and through `backends.ts` and `deciders.ts` to `harness-makers.ts` to `adapters/harness/library.ts:1`, and it is used only when the daemon builds a harness job. The saving lasts until the first job; M1' re-measures.

Not listed:

- `isomorphic-git`: `LaneWebs` calls `repoOf` for every lane with a cwd (`src/recap/application/lane-webs.ts:26`), so it loads with the first lanes.
- `@stateforge-labs/harness-hooks` and `zod`: they come inside the harness-adapters entry points that the transcript readers and the capability adapters use from the first observation.
- `drizzle-orm`: the store needs it at start.

`files` in `memory.json` lists every file on a static path from `main.ts` to the heavy module, with its lane: `src/daemon/main.ts`, `backends.ts`, `deciders.ts` and `harness-makers.ts` (lane B7) and `src/adapters/harness/library.ts` (lane B6). `library.ts` is also a file of step UAb, so M1 waits for UAb when both are open.

## Pane threshold: proposed, for the owner to confirm

Status: proposed, not chosen. The owner confirms or changes it in the review of this merge request; M3' checks the relay pane against the confirmed value.

Proposal: 10 MB (10240 kB) Pss per relay pane, measured without swap at 1, 5 and 10 panes.

- The relay pane is a Bun process started through `src/host/launch.mjs` that needs only `node:net`. Its floor is 5.8 MB Pss (plain Bun 2.4 MB, socat 1.0 MB).
- 10 MB leaves about 4 MB above that floor for the relay's own code, the protocol module and frame buffers, about 1.7 times the floor.
- 10 MB is about a quarter of today's column (40 to 46 MB Pss). At 15 tabs that saves about 450 to 540 MB of Pss on this machine.
- A relay over 10 MB most likely imports something it should not: one zod or harness-hooks chain alone costs more than 4 MB.
- Alternatives: 8 MB leaves about 2 MB above the floor, close to the measurement noise (one process moved by up to 0.4 MB between samples). 15 MB is looser and still about a third of today's column.
