# Transport: how the desktop frontend talks to the core and to the mod

Written 2026-11-08. Decides and describes the layers added after study R-2026-11-08-01
(`docs/research/studies/2026-11-08-desktop-transport-cli-vs-socket/`). It amends design decisions D2 and D4.

## Why

The first desktop build spawned `hc` for everything and handed state to the mod as files. Both tools have sockets. The study measured
the daemon's `hc` use: every `hc events` line, heartbeats included, triggered a full `hc ls` plus one `hc get` per agent (measured: about 24 `hc` calls a minute in one 60 s capture, and 21 in 90 s, roughly 14 a minute, in the T1 run with two agents; it grows with the number of agents). One spawn is cheap (about 1.4 ms); the cost is the design: a re-list on every event, output parsed again by
each consumer, no shared connection.

## Architecture

```
herdr-core socket                tab-recap daemon                             herdr-app
(JSON-RPC 2.0, NDJSON)

 calls  <---- HcCore link
 events ----> HcCore events -> roster --Fleet/Agents--> engine
                                                          |
                                                          v
                                                     GuiPublisher --atomic write--> <state>/gui/*.json
                                                          |                              ^   (fallback)
                                                          v                              |
                                                     DesktopBus (seq ring)               |
                                                          |                              |
                                                     DesktopApi 127.0.0.1 <--fetch-- mod (gui/) -+
                                                       (token file)   long poll /v1/events
```

Plain reading, left to right:

1. **HcCore** (`src/adapters/hc-core-*.ts`) replaces the spawns of `HcFleet` and `HcAgents` when `TAB_RECAP_HC_TRANSPORT=socket`.
   - `hc-core-link.ts`: one persistent `node:net` connection for calls, `hello` with generation 1, per-call timeout, reconnect with
     a capped backoff. Every failure becomes an `Unknown` value.
   - `hc-core-events.ts`: a second connection for `events.subscribe`. A snapshot, then events and heartbeats; no message for twice the
     15 s heartbeat resubscribes; `missed` brings a fresh snapshot.
   - `hc-core-roster.ts`: the lanes in memory. One `terminal.list` at the start, then each event changes one row. No re-list per event.
   - `hc-core-fleet.ts` and `hc-core-agents.ts`: `HcCoreFleet` and the agent status behind the same ports the CLI fleet fills.
     Typing into agents is still reported as not available.
   - `hc-core-wire.ts`: the codec and the JSON-RPC types; `hc-core-backoff.ts`: the retry timing.
2. **DesktopBus** (`desktop-bus.ts`): a ring of the last 500 `{seq, topic, tab, at}`. The publisher feeds it after each atomic file
   write, so the files and the bus cannot disagree. `since(seq)` returns the newer events, or `reset` when the client is too far behind.
3. **DesktopApi** (`desktop-api*.ts`): `node:http` on `127.0.0.1`, an ephemeral port, a token in `<state>/gui/api.json` (mode 0600), the
   `Host` header checked, a 64 KiB request cap. Routes are in `tab-recap/README.md`; responses are in `schema/desktop-api.v1.schema.json`.
   `desktop-lease.ts` holds the open leases (60 s, at most 256).
4. **The mod** (`gui/api.js`, `gui/feed.js`, `gui/store.js`) long-polls `/v1/events`, re-reads the index and the open tab on an event,
   and falls back to the files (folder watch plus a 15 s re-read) when the API is down. `TAB_RECAP_API=off` keeps it on files.
   - The wiring of all this is in `src/adapters/desktop-frontend.ts`; names and limits are in `desktop-constants.ts`.

## Decisions

| # | Decision | Reason | Evidence |
| --- | --- | --- | --- |
| 1 | The typed core client lives inside tab-recap, with no dependency. | The core speaks line-delimited JSON; `node:net` is enough. herdr-sdk targets the other server (protocol 22). | study README, finding 1 and "Options rejected" |
| 2 | `TAB_RECAP_HC_TRANSPORT=cli` stays the default until `socket` has soaked. | The socket path is verified on isolated cores only. | `evidence/t1-verify/` |
| 3 | The mod talks to the daemon over localhost HTTP with a long poll. | A mod has `fetch` but no raw socket; `fetch` to `127.0.0.1` works without a declared capability and held a 28 s response. | `evidence/t0-fetch/notes.md` |
| 4 | The files stay as the fallback and the schema of record. | The mod keeps working if the daemon or the API is down. | `evidence/t2-verify/verify-t2-t3.md` (c) |
| 5 | The mod checks `GET /v1/health` (no token) and compares `pid` and `startedAt` with `api.json` before it sends the token. | A stale `api.json` could name a port another program now uses. | `gui/RECIPE.md` |
| 6 | "Mark done" is a real engine close (`close` with `why: answered`), with no Undo. | The ledger has `add`, `update` and `close` only; nothing reopens a fact. | `evidence/t0-lookups/notes.md` section 2 |
| 7 | "Copy compact message" shows the engine's guidance, labelled as such. | It is read-only and calls no model, so the label says "Engine guidance, no model call". | `README.md` routes, `compact-message` |
| 8 | Copy uses `cx.write_to_clipboard`. | It is the only clipboard write a mod has; no capability gate is declared. | `evidence/t0-lookups/notes.md` section 1 |
| 9 | The core client treats `seq` as opaque and never compares it across connections. | `seq` restarts when the core restarts. | `evidence/hc-0.1.19/consolidated.md` (breaking or risky) |
| 10 | Do not depend on `holder` in `hc server status`. | After an update, terminals in a draining older holder make `holder` null. | same file |

## Measured

| What | CLI | Socket and API | Evidence |
| --- | --- | --- | --- |
| `hc` spawns by the daemon, 90 s idle | 21 | 0 | `evidence/t1-verify/README.md` |
| status change to `index.json` (6 changes) | 40 to 61 ms | 40 to 61 ms | same |
| three `hc server restart` in a row | not run | daemon alive; a new agent in `index.json` 546, 550, 551 ms after the restart began | same, round 2 |
| status change to the mod's store, working direction, median of 5 | 125 ms (files) | 82 ms (API; the samples are bimodal, from 0.04 s to about 2 s, so this is not a gain claim) | `evidence/t2-verify/lat-store-*.txt` |
| status change to rendered strip, median of 10 | 0.974 s (files) | 0.976 s (API) | `evidence/t2-verify/verify-t2-t3.md` (b) |

The render latency shows no gain. Under the test display the host resumes the mod's script about once a second, and that sets the render
time in both modes. In the idle direction the API was slower in the store (1.97 s against 0.82 s), because herdr takes about a second
to settle the pane and the API mode produces two events for one change. The latency benefit is not shown; a run on a real display is open.

## Open

- A mod cannot cancel a held `fetch`; after a window closes its last long poll lives up to about 25 s on the daemon.
- The T2/T3 verify run found that a daemon dying mid-session showed no notice (`verify-t2-t3.md`, "Gap"). `gui/RECIPE.md` now describes a
  daemon-down notice driven by the API; it has not been re-verified here.
- Peer credentials of the core socket and remote cores were not tested. Framed mode is not used.
