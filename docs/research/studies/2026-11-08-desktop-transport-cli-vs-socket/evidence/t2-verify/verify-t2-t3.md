# T2 + T3 end to end, isolated stack (verify run)

Stack: private core session, private app home, private Xvnc display, stub writer, fake agents emitting OSC 7501. State folder `t2-state/run1` for (a) to (c), `t2-state/fx` for (d). Daemon started with `TAB_RECAP_FRONTEND=gui` (launch-desktop). Nothing live was touched.

## (a) API by curl (state run1)

| Check | Result |
|---|---|
| `gui/api.json` mode | 600 |
| Listener | `127.0.0.1:<port>` only (ss -ltnp, owner is the daemon pid) |
| `GET /v1/health` with token | 200 `{"ok":true,"version":1,"seq":N,"pid":P}` in 0.9 ms |
| Same without token | 401 `unauthorized` |
| Same with `Host: evil.example` | 403 `bad-host` |
| `GET /v1/index` | 200, one row per tab with lanes |
| `GET /v1/tabs/<tab>` | 200 v2 document; unknown tab 404 |
| `/v1/events?since=<current>&wait=2` | 200 empty after 2.00 s |
| long poll woken by a status change | answered 38 ms after the change |
| `/v1/events?since=99999` | `reset:true` |
| SIGTERM of the daemon | listener gone, `api.json` removed |

## (b) Latency, status change to the mod

Fake agent flips working and idle. Test-only copy of the mod logs a time stamp when the strip renders the new status (render) or when the store applied the new index (store). Median over 10 changes each, Xvnc display.

| Measure | API | Files (TAB_RECAP_API=off) |
|---|---|---|
| change to render, median (s) | 0.976 (two runs of 10 gave 0.976 and 0.976) | 0.974 |
| change to render, working only, median | 0.980 | 0.974 |
| change to store, working only, median | 0.082 | 0.125 |
| change to store, idle only, median | 1.97 | 0.82 |
| change to the bus event, curl long poll (daemon side) | 0.050 (n=8) | not applicable |

Reading: the daemon and bus are fast (50 ms). The host resumes the mod's JavaScript on about 1 s boundaries under Xvnc, so the render lands near 0.97 s in both modes and the API shows no gain here. The idle direction waits for herdr to settle the pane (about 1 s) in both modes. In API mode one change produces a tab event then an index event; a quick experiment that reloads the index on any event did not remove the 1 s steps (lat-store-api-experiment.txt). The latency win of the API is therefore not demonstrated by this setup; a run on a real display is still open.

## (c) Fallback

| Step | Result | Shot |
|---|---|---|
| API mode, Brief open | rows from the API | c1-api-brief.png |
| `kill -TERM` of the daemon | mod keeps rendering from the files; store mode switches to `files` within seconds; no notice (see gap) | c2-daemon-killed.png, c2b-fleet-after-kill.png |
| Window opened with `ensure` failing | notice "The recap daemon is not running." with Restart, content from files | c3-daemon-down-notice.png |
| New daemon (new port and token) | store mode back to `api`, status change seen, window not reopened | c4-recovered-api.png |

Gap: `store.daemon` is only set at start and on Restart. A daemon that dies mid-session shows no notice, and after the new daemon is up the "not running" notice stays until the window is reopened. Suggested fix, in `gui/store.js`: set `this.daemon = "running"` in `enterApi` and `"down"` in `enterFiles` when it was API mode before.

## Parallel session

Another session (desktop-socket-event-bus-transport) was using the same private stack at the same time: a second daemon on the `fx` state folder (not mine) was started at 13:11 and I stopped it by pid to regenerate fixtures; the private core was left running for that reason.
