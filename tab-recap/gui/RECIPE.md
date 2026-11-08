# Tab Recap for the Herdr desktop app

One mod, four roles, picked by `props().role`. Nothing here edits a shipped layout.

## Roles

- `chip`: a small status chip, `N need you` and `M working`, with the worst status shape. Click it to open Fleet. It also polls the recap folder and shares the rows with the strips, and posts a "Compacted" toast once per compaction.
- `strip`: a pane header: status shape, the headline (red when the tab needs you), a context meter with the compaction hint as a tick, and a `Compacting` pill. Click it to open the Brief of its tab.
- `fleet`: the window listing every tab by urgency (Needs you, Done, Working, Idle) with filters, search, and a meter per row. Enter opens the Brief.
- `brief`: the same window on one tab: Brief, Story, Timeline and Session views, lane chips (each opens the compact popover), the "since you last looked" banner, the need card with Jump to lane, Now, Decisions, Next and Links.
- `compact`: the popover the window opens under a lane chip (a popup overlay, not a layout role).

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
- `tab-recap-desktop ensure` on start, `refresh <tab>` for Refresh, and `stop` then `start` then `ensure` for Restart.
- `touch` and `rm -f` on `<state>/gui/open.<tab>`: touched every 20 seconds while a Brief is open, removed when it closes (the daemon treats a marker older than 60 seconds as closed).
- `xdg-open <url>` for http and https links only.
- `run tab.select` and `run pane.focus` for Jump to lane.
- Reads `<state>/gui/index.json` and one `<tab>.json` per opened tab. Watches the folder and re-reads every 15 seconds as a fallback.
- Stores the "last looked" time per tab in the window's `localStorage`; nothing else is written.

## Not available yet

Compact and Reply need typing into agents, a later phase: both are drawn disabled with the tooltip "available once typing into agents is enabled". Version 1 documents show a "daemon is older" notice. Story chapter titles, options on a need and per-step compaction seconds have no source in the document and are not drawn.
