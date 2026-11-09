# T1 verify against a real isolated core (hc 0.1.19, session t1v)

Scripts: ../../scripts/t1-verify (hc-shim, agent.sh, driver.mjs, keepalive.mjs). Two synthetic agents (OSC 7501 states) on tabs tb1, tb2.
Counts are hc spawns by the daemon through a PATH shim (the driver's own calls use the real binary).

| Check | cli | socket |
| --- | --- | --- |
| hc spawns, 90 s idle | 21 (26 since daemon start) | 0 (0 since daemon start) |
| status change to index.json (6 changes) | 40-61 ms | 40-61 ms |
| index rows per step | same after normalizing terminal ids | same |
| kill then rm of agent | tab row stays, status idle, no lanes | identical |
| core restart | not run | daemon exits with code 13 within 5 ms (event loop empties) |
| core restart with a keep-alive timer injected | not run | reconnect and new agent shown in 505 ms |
| RSS start / end of 300 s | 124720 kB at start, no soak | 126028 kB / 118664 kB (min 117128, max 126456) |
| open unix sockets of the daemon | not measured | 2 (one events, one call link) |

Files: run.*.txt (driver log), daemon*.log, hc-calls.*.log (shim), index.*.json (published rows per step).

## Round 2 (after the resilience fixes: ref'd reconnect timer, one connection per subscribe, backoff reset after the cap)

Isolated core: HC_SESSION=t1v2, fresh state ~/.cache/hcs/t1-state2. Daemon: TAB_RECAP_FRONTEND=gui TAB_RECAP_HC_TRANSPORT=socket, no keepalive preload. Scripts: ../../scripts/t1-verify (env2.sh, driver2.mjs). Files: run.round2.txt (driver log), daemon-stdout.round2.log (daemon log), results.round2.json (per-recovery numbers). The hc PATH shim logged zero calls (hc-calls.round2.log is empty and not kept).

| Check | Result |
| --- | --- |
| 1. three `hc server restart` in a row | daemon alive each time; a new agent reaches index.json 546, 550, 551 ms after the restart began (about 505 ms after the core is up); next status change 20 ms |
| 1. three hard kills (kill -9 of the core pid, then `hc server start` 0.7 s later) | daemon alive each time; a new agent reaches index.json 1004, 2029, 1525 ms after the kill (268, 1294, 790 ms after the core is up); next status change 40-61 ms. The slowest case is the reconnect backoff growing across consecutive outages |
| 2. add then close an agent terminal | 0 lines matching 'blind at subscribe' or 'subscription ended', before and after all six core restarts. The only blind lines are 'blind at snapshot: unreachable: the core is down; reconnecting', logged while the core was down (8 lines over the six outages) |
| 3. idle 90 s | 0 hc spawns by the daemon (0 over the whole 8 min run) |
| 4. 300 s soak | RSS 130648 kB at start of the soak, 119832 kB at end (min 118756, max 130708; 124848 kB at daemon start); no growth. Unix sockets via ss -xp: 1 during the soak, 2 at the end (events stream plus call link); no child processes |
| 5. SIGTERM to the daemon pid | exit code 0, process gone after 19 ms, 0 sockets left for the pid |

Notes: `hc rm` of a killed agent leaves the tab row (status idle), as in round 1, so the driver's "row gone" wait times out by design; it is not a failure. The isolated core and all agents were stopped at the end; no process of session t1v2 remains.
