# Visual test of the desktop mod (task 6.1)

Run on 2026-11-07 in a throwaway session (own `hc` core, own app home, short scratch directories), never the live one. Fake
agents (`fake-agent2.sh`: OSC 7501 `working`, then `idle` or `blocked`) and a stub writer through
`TAB_RECAP_BACKEND=custom`, so no model tokens were spent. The mod ran `TAB_RECAP_FRONTEND=gui tab-recap ensure` itself.

| Check | Result | Evidence |
| --- | --- | --- |
| Overlay before any recap | says "No recap yet" | `overlay-empty.png` |
| A recap appears for the tab with an agent | goal and Now shown, tab chips with status dots, freshness line | `overlay-real-recap.png` |
| A rewrite appears without reopening | the overlay went from Now to Done and Next by itself | `overlay-after-rewrite.png` |
| Blocked colour | the blocked tab's dot and chip are red; the app's own list agrees | both pictures above |
| Chip shows count and worst status | "Recap · 4 agents · daemon running", red dot | `chip-after-window-restart.png` |
| Closing the window keeps the daemon | same pid (checked with `kill -0`) after the window was stopped and started again | pid file |
| `ensure` twice leaves one daemon | the pid file and process list showed one daemon | process list |
| Only agent tabs have recaps | a plain shell (no status) has no tab file or index row | `index.json` held only the two agent tabs |
| `tab-recap show --json <tab>` | printed the same document, with the lane count | stdout |

Not covered: the Refresh button (it queues a refresh through the same request table the terminal UI uses; not clicked), a real
agent session, and a real model run (task 6.2, needs the maintainer's agreement).
