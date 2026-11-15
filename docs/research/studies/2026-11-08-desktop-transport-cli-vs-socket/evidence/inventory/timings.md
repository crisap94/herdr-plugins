# Timings: read-only hc and tab-recap-desktop calls

Script: `~/Projects/homelab/herdr-plugins-gui-port/docs/research/studies/2026-11-08-desktop-transport-cli-vs-socket/scripts/timings.mjs`
Run: `mise exec node@24.22.0 -- node scripts/timings.mjs t3` (Node v24.22.0), 2026-11-08, on the desktop machine, one run.

Method: 30 sequential runs per command, no warm-up discarded. Wall time from spawn to exit via `execFile`, with `cwd` = home and a 10 s timeout (the value of `HC_TIMEOUT_MS`, `hc-fleet.ts:33`). Percentiles are nearest-rank. Only read-only commands were run: `hc ls --json`, `hc get t3 --json`, `hc read t3`, `tab-recap-desktop status`. Terminal `t3` is a local claude-code terminal taken from `hc ls`.

| command | runs | failures | median ms | p95 ms | min ms | max ms | mean stdout chars |
|---|---:|---:|---:|---:|---:|---:|---:|
| `hc ls --json` | 30 | 0 | 6.3 | 15.8 | 5.5 | 20.3 | 1433 |
| `hc get t3 --json` | 30 | 0 | 1.8 | 3.1 | 1.2 | 3.4 | 944 |
| `hc read t3` | 30 | 0 | 2.1 | 2.9 | 1.6 | 3.2 | 3620 |
| `tab-recap-desktop status` | 30 | 0 | 192.3 | 216.5 | 187.1 | 293.5 | 108 |

Notes:
- `hc read` is only called by the code when a lane's agent is listed in `TAB_RECAP_SCREEN_AGENTS` (see inventory row 3).
- `tab-recap-desktop status` is dominated by Node startup and module load. It is not an hc cost. It is not on the steady-state path.
- Remote terminals (`<machine>/tN` in `hc ls`) were not timed. Their `hc get` goes over the machine link and is expected to cost more.
- `touch`, `rm -f`, `printenv`, `xdg-open` and `tab-recap-desktop refresh` were not timed. `refresh` writes a request row and `xdg-open` opens a browser, so both are excluded by the read-only rule.
