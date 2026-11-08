# Tab Recap UX mockup

Static, dependency-free. Open `index.html` in a browser (file:// works). `legacy-single-file.html` is the old one-file version, kept for comparison.

Classic `<script>` tags share one global `TR` object, in dependency order (see `index.html`). Each file maps to a module of the future herdr-app mod, so porting is a move plus `import`/`export`.

| Mockup file | Future mod module / job |
| --- | --- |
| `css/tokens.css` | theme tokens, one role per colour, dark and light |
| `css/base.css`, `components.css` | shared styles for `ui/*` |
| `css/roles.css`, `views.css` | styles for `roles/*` and `views/*` |
| `js/constants.js` | `constants.js`: thresholds, labels, status order, keys |
| `js/data/fixtures.js` | invented data (replaced by the daemon's recap and fact store) |
| `js/data/derive.js` | pure helpers: urgency order, since-you-last-looked, timeline binning |
| `js/ui/*` | small reusable pieces: icons, status, pill, meter, button/kbd/seg/search, lane chip, hover card |
| `js/views/*` | the Brief tab contents: `brief`, `story`, `timeline`, `session` |
| `js/roles/strip.js` | pane-header strip role |
| `js/roles/chip.js` | status-bar chip role |
| `js/roles/ambient.js` | mockup-only app frame (pane strips, tabs, status bar) |
| `js/roles/fleet.js` | Fleet floating window role |
| `js/roles/window.js` | Brief window shell (views + footer) |
| `js/roles/popover.js` | compact popover (anchored to the lane chip) and toast |
| `js/app.js` | state, URL router, keyboard map, render loop (the mod's `main.js`) |

## URL params (drive headless renders)

`scene=fleet|brief|timeline|compact`, `theme=light`, `sel=api|web|jobs|docs|scratch`, `view=brief|story|timeline|session`, `lane=<i>` (open the compact popover on a lane), `run=<0-3>` (show the inline stepper on that lane), `bin=<i>` (select a timeline bin), `toast=1`, `solo=1` (hide page chrome).

## Keys

`j`/`k` move, `Enter` open, `/` search, `1`-`4` views, `c` compact, `r` refresh, `Esc` back or close.

## Render

`chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1240,800 --screenshot=out.png "file://$PWD/index.html?solo=1&scene=brief"`. Current renders are in `shots/v2/`.

## Status: locked

Approved by the maintainer on 2026-11-08 as the final view. The real mod (`tab-recap/gui/`) is ported from it module by module.
