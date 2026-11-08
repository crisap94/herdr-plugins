# Tab Recap for the Herdr desktop app

One mod, four roles, picked by `props().role`. Nothing here edits a shipped layout.

## Roles

- `chip`: a small status chip, `N need you` and `M working`, with the worst status shape. Click it to open Fleet. It also polls the recap folder and shares the rows with the strips, and posts a "Compacted" toast once per compaction.
- `strip`: a pane header: status shape, the headline (red when the tab needs you), a context meter with the compaction hint as a tick, and a `Compacting` pill. Click it to open the Brief of its tab.
- `fleet`: the window listing every tab by urgency (Needs you, Done, Working, Idle) with filters, search, and a meter per row. Enter opens the Brief.
- `brief`: the same window on one tab: Brief, Story, Timeline and Session views, lane chips (each opens the compact popover), the "since you last looked" banner, the need card with Jump to lane and Mark done, Now, Decisions, Next and Links.
- `compact`: the popover the window opens under a lane chip (a popup overlay, not a layout role). It also shows the engine's Compact message for the lane, with Copy and Copy handoff.

Fleet and Brief are one persistent window (`key: "tab-recap"`); the role only says which scene it opens in.

## Keys

`j` `k` move, `Enter` open, `/` search, `1`-`4` views, `c` compact, `r` refresh, `Esc` back, then close. Keys are ignored while a field has the keyboard, and with Ctrl, Alt or the platform key held.

## Opt-in layout recipe

Copy one of your layouts (`layout.clone`) and add:

```json
{ "id": "tab-recap", "content": { "mod": "tab-recap", "props": { "role": "chip" } }, "edge": "bottom", "align": "end" }
```

to the `"floating"` list of the node that holds your terminals, and, in the tab block's pane, the header:

```json
"header": { "content": { "mod": "tab-recap", "props": { "role": "strip" } }, "height": 34, "position": "top", "reveal": "always" }
```

The strip replaces the `pane` header, so the split, zoom and close buttons of that header are not there. To open Fleet from a key, bind `"alt-r": "tab-recap.fleet"` under `"global"` in `keys.json` (the chip delivers it; `tab-recap.brief` opens the focused tab). Without a layout edit, `herdr-app do mod.open --name tab-recap` opens the window.

## What the mod runs and reads

- `printenv TAB_RECAP_BIN` and `printenv TAB_RECAP_STATE` (unset means `tab-recap-desktop` on `PATH`, and `~/.local/state/herdr/plugins/tab-recap/desktop`).
- `tab-recap-desktop ensure` on start, and `stop` then `start` then `ensure` for Restart. Refresh also runs `refresh <tab>` when the API is down.
- With the API down: `touch` and `rm -f` on `<state>/gui/open.<tab>`, touched every 20 seconds while a Brief is open, removed when it closes (the daemon treats a marker older than 60 seconds as closed). With the API up the same two moments are `PUT` and `DELETE /v1/tabs/<tab>/open` (a 60 second lease the 20 second timer renews).
- Mark done (API only): on a need card with a fact id, `POST /v1/tabs/<tab>/needs/<fact id>/answer` after a confirm step (it closes the need for the terminal UI too and the ledger has no reopen, so there is no Undo). A 200 posts the toast "Marked as done" and re-reads the tab; 404, 409, 429, 401, a 5xx or an unreachable daemon draw one inline error line on the card ("That tab is gone", "Already closed", "Not a need", "Too many requests", "The daemon is not reachable") and the button works again. With the API down the button is disabled ("needs the daemon API"); a version 1 document carries no fact ids, so the button is hidden. Cards after the first show only Mark done (Jump, Reply and Send stay on the first).
- Compact message (API only): the popup asks `GET /v1/tabs/<tab>/compact-message?pane=<terminal>&note=<text>` when it opens and when the note settles (500 ms after the last keystroke, or when the field loses focus; one request at a time, the newest note wins). The answer is the engine's own guidance (`model: false`, no model call, nothing written) and is shown read-only with the caption "Engine guidance, no model call". Copy puts exactly that text on the clipboard (`cx.write_to_clipboard`), the label reads "Copied" for 2 seconds. Copy handoff asks `GET /v1/tabs/<tab>/handoff-message?from=<terminal>&to=<terminal>` for the chosen lane (a picker appears with three or more lanes; with one lane the button is disabled, "needs a second lane") and copies it. If the clipboard call throws or is missing, the text is shown selectable with "Copy failed, select the text". A message over its `limit`, an unknown tab and a down daemon are each one plain line, and Copy is disabled. Compact and Reply stay disabled.
- `xdg-open <url>` for http and https links only.
- `run tab.select` and `run pane.focus` for Jump to lane.
- The local API (`gui/api.js`, `gui/feed.js`): reads `<state>/gui/api.json` (`{version, port, token, pid, startedAt}`), then calls `http://127.0.0.1:<port>` with `Authorization: Bearer <token>`. It long-polls `GET /v1/events?since=N&wait=25` and, on an event, re-reads `GET /v1/index` and the open tab's `GET /v1/tabs/<tab>`; on `reset` it re-reads both. `POST /v1/tabs/<tab>/refresh` replaces the `refresh` command. A refused connection or a 401 makes the mod read `api.json` again (the daemon may have restarted with a new port and token) and retry once.
- Identity first: before every call that carries the token the mod asks `GET /v1/health` without any header and sends the token only when its `pid` and `startedAt` equal those in `api.json`. A mismatch means `api.json` is stale: the mod sends nothing to that port, treats the daemon as down and re-reads the file (and checks again) on the existing backoff.
- Daemon-down notice: once the API has answered, a failed long-poll with health unreachable or `api.json` gone or stale sets the daemon to down, so "The recap daemon is not running." with Restart appears; the next answer from the API clears it. In pure file mode (the API never seen) the notice only follows `ensure` and Restart, as before.
- Epoch: every `/v1/events` answer carries `epoch`; when it differs from the last one the daemon restarted, and the mod resets `since` and re-reads the index and the open tab, exactly like a `reset` answer.
- One long-poll per window: only the chip and the window roles run the feed and the folder watcher. A strip does neither: it shows the rows the chip shares and keeps just its slow file reload (15 seconds) as the fallback, so N panes never hold N fetches.
- A held fetch cannot be cancelled by the mod: after a window closes, its last long-poll lingers on the daemon for up to about 25 seconds, then ends on its own and is not renewed.
- The fallback: when the API is absent or down, the mod reads `<state>/gui/index.json` and one `<tab>.json` per opened tab, watches the folder, and re-reads every 15 seconds. It keeps retrying `api.json` (2 s, doubling to 30 s) and switches back to the API when it answers, in either direction at any time. Set `TAB_RECAP_API=off` on the daemon to keep it files-only.
- Stores the "last looked" time per tab in the window's `localStorage`; nothing else is written.

## Not available yet

Compact and Reply need typing into agents, a later phase: both are drawn disabled with the tooltip "available once typing into agents is enabled". Version 1 documents show a "daemon is older" notice. Story chapter titles, options on a need and per-step compaction seconds have no source in the document and are not drawn.
