# Inventory: external processes spawned by the tab-recap desktop frontend

Repo: `~/Projects/homelab/herdr-plugins-gui-port/tab-recap` (read only). Timings are in `timings.md`.

Scope: the daemon path that runs under `TAB_RECAP_FRONTEND=gui` (`launch-desktop.mjs:3`, `frontend.ts:7-9` returns `desktopFrontend()`), and the GUI mod in `gui/`. Out of scope and not reached from the desktop path: `src/column/main.ts:148,154` (spawns `compact` and `configure` launchers), `src/adapters/glow.ts:19,24` (`spawnSync glow`, used only by `column/main.ts:45-58`), `src/adapters/experiment-files.ts:8,15` (`spawnSync find` and `grep`), `bin/tab-recap.ts:55`, `bin/autocompact-label.ts:46`, `bin/check-domain-*.ts`.

Only `hc` (through `HcFleet`) and the desktop CLI are spawned on the desktop path. `hc` calls use `run` from `process.ts:29`, which wraps `node:child_process.spawn` in `process-posix.ts:10`.

## Call sites

| # | file:line | program and arguments | what it is for | what triggers it | calls per minute (estimate and reasoning) |
|---|---|---|---|---|---|
| 1 | `src/adapters/hc-fleet.ts:43` | `hc events --json` (stdout piped, stderr ignored), long-lived | change feed that wakes the daemon | subscription start: boot (`main.ts:255`), every 10th informer tick (`informer.ts:172-173`, every 10 min), watchdog after 5 min of silence (`informer.ts:52,168`), stream end or error, retry backoff 1 s doubling to 60 s (`informer.ts:51`) | about 0.1/min steady (one respawn per 10 min) plus rare restarts |
| 2 | `src/adapters/hc-fleet.ts:76` (called from `listing()` at 93-115) | `hc ls --json` (cwd home, 10 s timeout) | roster of live terminals; base for every snapshot and diff | every `hc events` line after the first (`hc-fleet.ts:178-184`, `pump` at 143-163, one run plus one queued at a time); resync every 60 s (`main.ts:251` through `informer.ts:229-236`, 400 ms debounce `informer.ts:42`); `sessionOf` (`hc-fleet.ts:125`); `HcAgents.status` (`hc-fleet.ts:250`, `hc-agents.ts:29`), used by settle polls (`settle-hub.ts:72,79`) and compaction and handoff (`compaction.ts:74`, `handoff-confirmation.ts:103`, `handoff-print.ts:160`) | idle: about 4/min. One resync per minute plus about 3 pumps per minute, since a 60 s capture of `hc events` returned 1 snapshot line and 3 heartbeat lines and every line after the first triggers a pump. Active: plus one per real event, coalesced. Settle wait: 30/min per waiting pane (`settle-hub.ts:6-7,78-83`, POLL_MS 2000 over the settle window) |
| 3 | `src/adapters/hc-fleet.ts:80` (called from `readScreen` at 214-217) | `hc read <pane>` | screen text for transcript fallback | `screen-transcripts.ts:51`, only for agents named in `TAB_RECAP_SCREEN_AGENTS` (`screen-transcripts.ts:38-43`) | 0/min by default. When configured, one per transcript read of that lane; frequency not measured |
| 4 | `src/adapters/hc-fleet.ts:85` (called from `terminalOf` at 83-91, in parallel at `hc-fleet.ts:113`) | `hc get <terminal-address> --json`, one per agent row in the roster | full terminal record: app, status, cwd, pid (feeds `sessionOf` and `status`) | every listing (row 2), once per agent row. Remote addresses (`<machine>/tN`) take the same path | = listings x agents. The sample `hc ls` had 10 live rows, 5 of them agent apps (4 claude-code, 1 opencode) if shells are filtered at `hc-terminal.ts:104-107`, otherwise 10. Idle: about 4 listings x 5 = 20/min. Settle wait: about 30 x 5 = 150/min per waiting pane |
| 5 | `bin/desktop-daemon.ts:28` | `node src/daemon/launch-desktop.mjs`, detached, stdio to log | start the daemon | `startDesktopDaemon` (`desktop-daemon.ts:13-32`) from `tab-recap-desktop ensure` or `start` when the pidfile is not alive | about 0/min. Once per daemon start |
| 6 | `gui/commands.js:6` (`envOf`, via `resolve` at 8-16) | `printenv TAB_RECAP_BIN`, `printenv TAB_RECAP_STATE` | locate the binary and the state folder | `resolve()`, cached in `environment` | 2 per GUI process lifetime |
| 7 | `gui/commands.js:25` (`ensureDaemon`) | `<bin> ensure` (`tab-recap-desktop ensure`) | start the daemon if it is not running | `store.js:28` on every `store.start` with ensure true: `chip.js:18` and `window.js:46`. `strip.js:18` passes false | a few per session (each chip init and window open); about 0/min idle. Cost per call is about 190 ms of Node start (see timings) |
| 8 | `gui/commands.js:26` (`refreshTab`) | `<bin> refresh <tab-id>` | ask the daemon to rebuild a tab; writes a request row | `window-actions.js:59-62` (refresh and refresh-all click, once per tab) | per click: number of tabs. Otherwise 0. Each call opens the SQLite store (`cli-store.ts:6`), cost not measured |
| 9 | `gui/commands.js:33-34` (`restartDaemon`) | `<bin> stop`, then `<bin> start`, then `ensure` (`commands.js:35`) | restart the daemon | `window-actions.js:67-70`, user click on restart | 3 processes per click; otherwise 0 |
| 10 | `gui/commands.js:43` (`touchMarker`) | `touch <state>/gui/<marker-prefix><tab>` | keep the open-tab marker fresh so the daemon treats the tab as watched (`desktop-expanded.ts:100-105`, fresh for 60 s) | `window.js:48` via `INTERVAL.marker` (`constants.js:54`, 20000 ms), while the brief scene shows a selected tab | 3/min while the brief is open with a selection; 0 otherwise. Not timed |
| 11 | `gui/commands.js:49` (`clearMarker`) | `rm -f <marker path>` | clear the marker | user action in the window (`window.js:71`, `window-actions.js:37`) | event-driven, under 1/min |
| 12 | `gui/commands.js:59` (`openLink`) | `xdg-open <url>` (only for URLs matching `WEB_URL`) | open a web link from the window | user click on a link | event-driven, rare |

Spawn lines in the desktop path: 10 (`hc-fleet.ts:43,76,80,85`, `desktop-daemon.ts:28`, `commands.js:6,22,43,49,59`). Rows 7 to 9 have no spawn line of their own. They are three callers of the `desk` wrapper, whose single spawn point is `commands.js:22`.

Not counted as processes:
- `gui/store.js:26` polls the index every 15 s (`constants.js:54`, `poll: 15000`) through `reload` and `watch`. These use `readTextFile` and `watchFolder` from the `herdr` module, which was not inspected. Treated as not a process spawn from tab-recap code.
- `gui/commands.js:54-55` (`jumpToLane`) uses `run("tab.select")` and `run("pane.focus")` from the `herdr` module. Not counted.
- `window.js:49` `INTERVAL.tick` (30 s) only calls `notify`.

## How the daemon finds out about changes

Hybrid. The data source is always a full re-list. Triggers come from two sources.

1. Event trigger: `hc events --json` is a long-lived child (`hc-fleet.ts:43`, `subscribe` at 165-188). Every line after the first triggers `pump` (`hc-fleet.ts:178-184`), which runs `hc ls` and `hc get` per agent and diffs the result (`hc-frames.ts` `framesBetween`). The event line content is ignored. Heartbeats also trigger a re-list.
2. Poll fallback: `RESYNC_MS = 60000` (`src/daemon/timing.ts:2`, used at `main.ts:251`) calls `informer.tick` (`informer.ts:166-176`). Nine of ten ticks call `resync` (`informer.ts:229-236`, debounce `RESYNC_DEBOUNCE_MS = 400`, `informer.ts:42`). Every tenth tick calls `enterSubscription` (`RESUBSCRIBE_EVERY = 10`, `informer.ts:54`).

Other intervals:
- `REQUEST_POLL_MS = 1000` (`timing.ts:1`, `main.ts:231`). Polls the request queue in the database, not hc.
- `WATCHDOG_MS = 300000` (`informer.ts:52`).
- Retry backoff `retryBaseMs 1000` and `retryMaxMs 60000` (`informer.ts:51`).
- `HC_TIMEOUT_MS = 10000` (`hc-fleet.ts:33`).
- `SETTLE_MS = 4000`, `POLL_MS = 2000` (`settle-hub.ts:6-7`).
- Desktop read cache: `EXPANDED_EVERY_MS = 5000`, `SETTLE_MS = 3000`, `OPEN_MARKER_FRESH_MS = 60000` (`desktop-constants.ts`). Not hc.
- GUI: `poll 15000`, `marker 20000`, `tick 30000`, `focus 400`, `refreshMax 8000` (`gui/constants.js:54`).

## Busiest trigger and cost

- Steady idle: pumps from heartbeats and resync, about 4 listings a minute, which is about 24 hc calls a minute (4 ls plus 20 get). The busiest recurring trigger is the heartbeat-driven pump (row 2 and row 4).
- Peak: a settle wait (compaction or handoff) polls status every 2 s, about 30 listings a minute, about 180 hc calls a minute per waiting pane (row 4).

Cost (from `timings.md`): median of `hc ls` 6.3 ms, `hc get` 1.8 ms, `hc read` 2.1 ms. A typical hc call costs about 2 ms wall. One full listing with 5 agents is about 15 ms of process time, and since the gets run in parallel (`hc-fleet.ts:113`), wall time is nearer 8 to 10 ms. `tab-recap-desktop` costs about 190 ms per call, all Node start.

Observations: the `hc events` capture was 4 lines in 60 s (1 snapshot, 3 heartbeats) with no real changes. So the feed is cheap at idle and the cost is mostly the forced re-list on every heartbeat and the 60 s resync.
