---
id: R-2026-11-08-01
name: "Desktop transport: CLI versus socket"
question: "For tab-recap's desktop frontend, is spawning the hc and herdr-app CLIs the right way to talk to herdr-core and the desktop app, or should the daemon and the mod use their sockets?"
date: 2026-11-08
owner: "tab-recap maintainer"
method: live-probe
status: concluded
superseded_by: null
confidence: medium
informs: [gui-port transport decision (S0 HcFleet/HcAgents and the mod command channel)]
tags: [herdr-core, hc, socket, transport, gui-port]
---

# Desktop transport: CLI versus socket

## Question

tab-recap's desktop frontend talks to herdr-core and the desktop app by spawning the `hc` and `herdr-app` CLIs. The maintainer asked whether that is the right transport, given that both tools have sockets, and wants an event-stream API in the style of herdr-sdk.

## Method

Read-only probes on 2026-11-08 against the live core (`hc` 0.1.18) and app, plus a read of the repository.

**Protocol (written before collecting):** sources are `hc schema`, `hc --skill`, the app guide and type files, and the code. Probes use only read methods, with no keys, kills, labels or layout changes. The answer is judged on whether a Node daemon with zero dependencies can use the sockets, what that gains over spawning, and what a mod can reach. Scripts are in `scripts/`.

**Deviations:** the first events probe listened for 9 s and saw no heartbeat. The heartbeat period is 15 s, so it was re-run for 20 s (`scripts/subscribe-20s.mjs`).

## Findings

| # | Finding | Evidence | Confidence |
|---|---|---|---|
| 1 | The `hc` core socket speaks newline-delimited JSON-RPC 2.0. `hello` lists generation 1, 32 methods and features. A request without a trailing newline gets no reply. Requests can be pipelined. | `evidence/hc-socket/wire.txt` | high |
| 2 | `hc` is a thin client: `hc get --json` is byte-identical to the raw `terminal.get` result, and `hc ls --json` is a 7-field projection of the 28-field `terminal.list`. That the CLI uses this same socket was not confirmed (no strace). | `hc-get-t6.shape.json`, `hc-ls.shape.json` (shapes only) | medium |
| 3 | The events stream works over the plain unframed socket: a snapshot at 0 s and a heartbeat at 15.0 s. The documented event kinds were not observed because the core was quiet. Framed mode is for attach (screen bytes, keys), and its frame layout is undocumented. | `subscribe-20s.txt`, the probe output (raw terminal listings were removed because they carry private paths and titles; `scripts/probe-methods.mjs` reproduces it) | medium |
| 4 | Spawning `hc` costs about 1.4 ms per call. Median list: 6.5 ms CLI vs 4.2 ms socket; get: 1.4 ms vs 0.03 ms. | `latency.json`, `inventory/timings.md` | high |
| 5 | The daemon spawns `hc` at 4 sites. Every `hc events` line, heartbeats included, triggers a full `hc ls` plus one `hc get` per agent: about 24 hc calls a minute idle, up to about 180 a minute per pane during a compaction wait. The rate rests on one 60 s capture. | `inventory/inventory.md` | medium |
| 6 | `herdr-app.sock` takes one JSON request per connection with four shapes (`ls`, `status`, `commands`, `do`), no handshake, no subscription and no push. The `do` shape was not probed because every command mutates. | `herdr-app/direct-readonly.txt`, `tap-ls.txt` | high (shapes), low (`do`) |
| 7 | A mod can `exec`, call `hc(args)`, `fetch` (unrestricted), read and write some files and `watchFolder`. It has no raw socket, WebSocket or EventSource. Whether `fetch` reaches localhost or streams a response was not tested. | `herdr-app/mod-io-surface.txt` | medium |

## Options rejected and drawbacks

- **Keep the CLI everywhere:** works, with a 1.4 ms spawn cost per call. Its weaknesses are re-parsing output in every consumer and a full re-list on every event. The `fetch` spike is done and passed, so the mod now reads the daemon API and keeps the files and the CLI only as its fallback.
- **Use herdr-sdk:** it targets the other server (protocol 22, 102 methods) and is a private-registry dependency. It overlaps `hc` on two method names only.
- **Use framed mode now:** undocumented layout, and not needed for status events.

## Limits and threats to validity

One machine, `hc` 0.1.18, a quiet core. Latency was measured by one run of 50 calls each. Peer-credential behaviour and remote cores were not tested.

## Recommendation

Proceed with conditions, medium confidence. In the daemon, replace the CLI spawns with a typed `node:net` client of the core socket (zero dependencies), with an event stream that applies each event to a cached fleet instead of re-listing. Put it behind the existing `Fleet` and `Agents` ports, with a fake core for tests. Test it against the CLI-based `HcFleet`. For the app side, wrap `herdr-app.sock` with polling, since it has no push. For the mod, run a spike on `fetch` to a localhost daemon endpoint before replacing `exec`.

## Open questions and follow-ups

- Do `fetch` calls from a mod reach `127.0.0.1`, and can they stream a response?
- What are the event kinds in practice (`status`, `turn`, `title`, `labels`)? Capture with a throwaway agent.
- Frame layout of framed mode, if attach is ever needed.
- The shape of `do` on `herdr-app.sock`.
- Does the `hc` CLI use `default.sock`?

## Follow-up 2026-11-08

The findings above are unchanged. This section adds what the later work measured. Paths are under `evidence/`.

### T0 results (isolated core, `hc` 0.1.18)

- **Core socket path** (`t0-core/path-rule.md`): `<runtime>/herdr-core/<session>.sock`, with `<runtime>` = `$XDG_RUNTIME_DIR` (else `/run/user/<uid>`) and the session from `HC_SESSION` (default `default`). `HC_SOCKET` overrides it, but the client must use the path the core started on or it gets `unavailable`. The `hc` CLI does connect to this socket (seen with `ss -xp` during a call). This answers the open question "does the CLI use `default.sock`".
- **Event kinds** (`t0-core/notes.md`, `t0-core/frames.ndjson` and the `frames.r*` files): seen `created`, `foreground`, `labels`, `title`, `status`, `turn`, `keep`, `lost`, `restarted`, `finished`, `removed`, `size` and `doc`. Each arrives as `{"jsonrpc":"2.0","method":"event","params":{"seq","terminal","type","data"}}`. `seq` is global and rises. `doc` events have no `terminal`. `status` carries `{records, reported, status:{app,state}|null}`; `turn` only at some transitions.
- **Filters** on `events.subscribe`: `labels`, `terminal`, `children_of`. A named terminal or parent must exist at subscribe time (error `not_found`, no stream).
- **Missed and slow readers:** a subscriber paused for 30 s during 2500 label updates got about 664 events, then `missed` with a fresh snapshot, then heartbeats. In a different run (150 events with 6 KB labels) the core closed the connection instead. A slow reader can therefore see `missed` or end of stream; the client has to handle both. The queue size that triggers `missed` lies between about 660 and 2500 events.
- **Mod `fetch` to localhost** (`t0-fetch/notes.md`): worked without a declared capability. A 28 s held response succeeded, a 3 MiB body came back whole, the `Authorization` header arrived unchanged, a POST body arrived, a refused port gave a rejected promise. Not tested: holds over 30 s, bodies over 3 MiB.
- **Clipboard** (`t0-lookups/notes.md`): the mod context has `write_to_clipboard(text)` and `read_from_clipboard()`, with no capability gate in the declaration.
- **Reopen** (`t0-lookups/notes.md`): the ledger has `add`, `update` and `close`; no operation turns a closed fact back to open, and `update` and `close` refuse a closed target. A closed question can come back only as a new fact.

### herdr-core 0.1.19 review

`hc-0.1.19/consolidated.md` (sources in the same folder). The wire is unchanged: `hello` still reports generation 1 and 32 methods, `hc ls --json` and `hc get --json` keep their shapes, events still give a snapshot and a 15 s heartbeat. New: detached programs survive their terminal closing, and updates keep the core's environment. Risky: cleanup no longer sweeps detached processes, `seq` restarts when the core restarts (15 and 10682 were seen on the two sides of a restart), and `holder` can be null while an older holder drains. The event kinds under real change were not re-captured on 0.1.19.

### T1 verification: socket against CLI (`t1-verify/README.md`, `hc` 0.1.19)

| Check | CLI | Socket |
| --- | --- | --- |
| `hc` spawns by the daemon, 90 s idle | 21 | 0 |
| status change to `index.json`, 6 changes | 40 to 61 ms | 40 to 61 ms |
| index rows per step | same after normalizing terminal ids | same |

Round 2 (after fixes to the reconnect timer, one connection per subscribe and the backoff reset): three `hc server restart` in a row, daemon alive each time, a new agent in `index.json` 546, 550 and 551 ms after the restart began; three hard kills of the core, a new agent after 1004, 2029 and 1525 ms (the longest case is the backoff growing across outages); 0 `hc` spawns over the 8 minute run; RSS 130648 kB to 119832 kB over a 300 s soak; SIGTERM exits with code 0 in 19 ms. The first round also showed the daemon exiting when the core went away (the event loop emptied) until the reconnect timer kept the process alive.

### T2 and T3 verification: API and mod (`t2-verify/verify-t2-t3.md`)

- Token file mode 600; the listener is on `127.0.0.1` only; no token gives 401; `Host: evil.example` gives 403; an unknown tab gives 404; a long poll was woken 38 ms after a status change; `since` far ahead gives `reset: true`; SIGTERM removes the listener and `api.json`.
- **Latency, honestly:** change to rendered strip, median of 10 changes: 0.976 s with the API, 0.974 s with files (`TAB_RECAP_API=off`). The render shows no gain. Under the Xvnc test display the host resumes the mod's script about once a second, which sets the render time in both modes. Change to the mod's store, working direction, median of 5: 82 ms with the API, 125 ms with files (`t2-verify/lat-store-api.txt`, `lat-store-files.txt`). In the idle direction the API was slower (1.971 s against 0.820 s), because herdr takes about a second to settle the pane. The daemon side is fast: change to the bus event about 50 ms (`lat-bus.txt`, 8 samples). A run on a real display is still open.
- **Fallback:** with the daemon killed the mod kept rendering from the files; with `ensure` failing it showed "The recap daemon is not running." with Restart; a new daemon (new port and token) switched the store back to the API. One gap was found (no notice when the daemon dies mid-session).

### Limits of this follow-up

Isolated cores and one display. Single runs for the restart numbers. Two sessions used the same private stack during the T2/T3 run.
