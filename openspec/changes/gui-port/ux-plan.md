# UX plan: a recap designed for a GUI, not copied from the terminal

Written 2026-11-08. Sources: the TUI inventory in `roadmap.md` section 1, the mod API inventory (a read-only agent over
`~/.config/herdr-app/{AGENTS.md,herdr.d.ts,gpui-kit.d.ts}` and the shipped mods; **reported, partly verified**: popover placement,
table and editor signatures, floating edge/peek details and nine shipped mods were not read), and the Phase 2 overlay as built.

## 1. Why the current overlay is not the answer

Phase 2 reproduces the terminal modal in a window: one tab at a time, a wall of text, two views. It is a faithful port and a good
fallback, but it wastes what a GUI has: always-visible surfaces, many tabs at once, pictures instead of words, hover and click,
forms, motion. The terminal column answers "what is this tab doing?" only for the tab you are looking at. The questions people
actually have are different:

| Moment | Question | TUI answer | What a GUI can do |
| --- | --- | --- | --- |
| Glance | Which of my agents need me, right now? | one tab's column | all tabs ranked by urgency, always on screen |
| Re-entry | I was away three hours: what happened? | read the whole recap | "since you left": what changed, what needs me, first |
| Decide | An agent is blocked: what does it want? | scroll to NEEDS | the question first, with the waiting time and a jump button |
| Act | Compact, hand off, refresh | key and popup | buttons in context, a note field, a preview |
| Audit | Why did we decide that? | text modal | a visual timeline with filters and search |
| Tune | Change models, hint, language | settings modal | a real form with live feedback |

Rule kept from the approved plan: **no TUI function is lost** (parity matrix). What changes is where each lives and how it looks.

## 2. What the mod API gives us (and does not)

Usable: persistent `window` overlays (`key` remembers the position, `keep`, `frame: "none"`), popups at the pointer, dialogs, toasts
with an action (`notify({title, body, level, action})`), a pane-header mod per pane (`reveal: "always"` or `"hover"`, with
`props().pane`), a status-bar slot, floating blocks, native panes with a mod; live data for **every** space, tab and pane
(`spaces() agents() panes() focused() theme()`, `TabInfo.working_since / settled_at / changed_at`); `shared()/setShared()` between
mods; components `Tabs, Progress, Popover, HoverCard, Collapsible, Accordion, Table, Input, Textarea, Select, Slider, Switch,
Toggle, Button, Link, TextView.markdown, Scrollbar, virtual lists`; native animation (`svg.spin`, `.loop`, `.transition`);
clipboard, `open_url`, `playSound`, `run(...)` for focusing tabs and panes.

Missing: charts and sparklines (draw them from `div`s and `svg`), a badge component, a context-menu component (use a popup
overlay), generic drag, timers for animation (native only), and any key or click **automation** for tests (see section 7).

## 3. Information architecture: four layers, one idea each

```
 L0 ambient      always visible, zero clicks     header strip per agent pane, one chip on the status bar
 L1 fleet        all tabs, ranked by urgency      a persistent window: "Fleet"
 L2 tab brief    one tab, re-entry first          a drawer card: Brief | Story | Timeline | Session
 L3 act          compact, handoff, reply, tune    popovers and dialogs from the place you decide
```

### L0 Ambient

- **Pane header strip** (opt-in layout clone, never an edit of a shipped layout): for a pane with an agent, one line under the
  frame: status icon (spinner for working, "Needs you" pill for blocked, dot for done, ring for idle, the app's own language), the
  headline of the lane's recap (the NOW line, or the open need in red), a **context meter** (a slim bar with the compaction
  threshold as a tick), and a "stage" glyph while compacting. Click opens the tab brief at that lane. `reveal: "always"` for agent
  panes, hover elsewhere.
- **Chip** becomes a fleet strip: `2 need you · 3 working`, colour of the worst status, a count animation when something
  changes. Click opens Fleet. Replaces the bar of the TUI (the bar was one headline per tab; this is one headline per tab, plus
  a ranking).

### L1 Fleet (new; the TUI cannot do this)

A persistent, draggable window listing **every tab of every space**, sorted by urgency: needs you, blocked, done and unseen,
working, idle. A row: space / tab name, status icon, the headline, lane dots, "waiting 14 min", context meter, age. Selecting a
row shows its brief on the right (or below at narrow widths). Click or `Enter` focuses that tab (`tab.select`, `pane.focus`).
`j/k`, `/` to filter by text, status chips as toggles, "mine only" (needs me). The daemon already writes one document per tab and
`index.json`; the index rows gain `headline`, `needs` (count), `waitingSince` and `contextPercent` (additive, branch-only file).

### L2 Tab brief (re-entry first)

A card, not a wall. Top: tab name, status, goal in one line, freshness ("recap 3 min ago", **Refresh** with a spinner).
Then **Since you left** (the mod keeps a per-viewer `lastSeen` per tab in `localStorage`, computed against fact times): "2 new
decisions · 1 need open · 14 facts · compacted once". Then, in this order: **Needs you** (red, with waiting time, a *Jump to
lane* button and, after P4, a *Reply* field), **Now**, **Decisions** (cards, the reason folded in a `Collapsible`, `closed: why`
as a muted line), **Next**, **Links** (chips that open). A segmented `Tabs` control switches Brief | Story | Timeline | Session
facts; the existing Phase 2 views become the *Audit* content of these tabs, so that work is reused, not thrown away. Markdown task
bodies use `TextView.markdown` (the mod no longer needs its own renderer).

### L3 Act

- **Compact** lives on the lane: the context meter is the button. A popover opens with a `Textarea` and a 280-character counter,
  the hint ("45% of 1M, compact?") and a *Compact* button; while it runs the lane shows a **stepper** (briefing, compacting,
  restoring, done) with the stage's spinner and seconds, then a toast with a *Jump* action. Needs P4 (typing proof).
- **Handoff** is a dialog: pick the source lane and the target (closed lanes included), see the brief rendered
  (`TextView.markdown`), edit it, *Copy* or *Send*. Needs P4.
- **Settings** is a form: `Select` for backend and models, `Select` for language, `Switch` for autocompact and the git note,
  `Slider` for the compact hint, `Input` for retention days; changes apply as the TUI does, with a live "next recap will use…"
  line. **Diagnostics** is a checklist (daemon running, writer found, `hc` version in range, database not newer) with a fix
  button where one exists (*Restart daemon*).
- **Notifications**: one toast per event (needs you, compaction done, refusal, no writer), each with an action that focuses the
  lane; never a duplicate of the app's own "needs you"; optional sound off by default.

### Timeline, drawn

A horizontal strip above the list: one tick per fact (colour by section), chapter and compaction breaks as taller markers, day
separators as labels, drawn with `div`s. Hover shows the fact (`HoverCard`), click scrolls the list; the list below has section
filters (toggles) and a search `Input`. Replaces the 40-row wall.

## 4. Principles every screen follows

1. **Answer first, evidence on demand.** The need or the headline is the first line; reasons, timeline and session facts are one
   click away, never in the way.
2. **Urgency is the sort order and the colour.** Red only means "needs you". Working is calm, idle is quiet.
3. **Cross-tab by default**, one-tab detail on demand.
4. **Every number has a picture** where it helps (context meter with the threshold, waiting time as a bar growing in the row).
5. **Motion only for state change** (spinner while working or updating, a short transition when a status flips), native animation only.
6. **Keyboard complete, mouse friendly**: every action has a key (`j/k`, `Enter`, `/`, `r`, `c`, `Esc`, `1-4` for tabs), shown in a
   footer; hover tooltips name them.
7. **The app's own look**: colours only from `theme()` tokens (light and dark), the app's icons, no custom palette.
8. **Honest empty and error states**: "No agent in this tab yet", "Daemon is not running — Start", "Recap failed: <why> — Retry".
9. **Nothing hidden by truncation**: where text is cut, a fold or a hover shows all of it, and cuts the daemon made are said.

## 5. Where each TUI function lives (parity stays)

| TUI | New home |
| --- | --- |
| Column per lane | L0 header strip + L2 Brief lane rows |
| Bar | L0 chip + Fleet row headlines |
| Expanded view | L2 tabs Story, Timeline, Session |
| `column` / `columns` hide | per-tab and global "show strip" toggles in Settings and the strip's menu |
| `refresh` | Refresh button (brief, Fleet row menu), key `r` |
| `compact`, note | L3 compact popover |
| `handoff` | L3 handoff dialog |
| `autocompact` | Settings switch, decisions shown in Session facts |
| `configure`, `backend`, `status` | Settings and Diagnostics |
| Notifications | toasts with jump |
| OSC 8 links | link chips |
| Locale | Settings + all strings from the locale tables |

## 6. Work, in order (replaces the presentation half of roadmap P2; P1 document, P3 to P6 data work stay)

Each step: design by a Sonnet agent, mechanics by Haiku, isolated visual run with screenshots, an independent Sonnet review, a
render-tree test, then the maintainer's real-input QA in the live app, then one merge request. Under 10 agents per workflow.

| Step | Delivers | Needs |
| --- | --- | --- |
| U0 spike | mod folder with several files? `reveal: "always"` strip from `props().pane`; `shared()` between two mods; `TextView.markdown`, `HoverCard`, `Collapsible`; a persistent `window` with `key`; real-input route (below) | nothing |
| U1 Fleet | Fleet window, chip as fleet strip, index rows with `headline/needs/waitingSince/contextPercent` | U0 |
| U2 Brief | brief card, since-you-left, Tabs, Story and Session from the Phase 2 code, markdown via the component | U1 |
| U3 Strip | pane header strip with context meter and stage glyph, opt-in layout clone installer | U0 |
| U4 Timeline | drawn timeline, filters, search | U2 |
| U5 Act | compact popover, stepper, handoff dialog, reply | P4 typing proof |
| U6 Tune | Settings form, Diagnostics checklist, toasts with jump | P3 notices, P5 |
| U7 Polish | motion, light theme pass, empty/error states, keyboard map, density | all |

Phase 2 as built (overlay with Recap and Full) is committed first as the **classic audit view** after its fixes pass; it becomes
the content of the Story and Timeline tabs, so nothing already verified is discarded.

## 7. The testing gap, and the plan for it

Neither `herdr-app` nor the visual run can send real key or click events (the Phase 2 run called the mod's handlers through a
test copy). Plan: (1) a **render-tree test harness** in `tab-recap/test/`: run `main.js` under Node against a small fake
`gpui-kit` that records the element tree, then assert on structure and handlers (this tests layout decisions, handlers and
state, but not pixels or real focus); (2) screenshots per state as now; (3) in U0, try a **window-targeted input route**
(compositor tools that address one window without needing focus; the desktop runs as another user, so this may be impossible:
the spike says so); (4) a short **QA checklist** per step for the maintainer in the live app (keys, clicks, wheel, drag).

## 8. Decisions (maintainer, 2026-11-08)

1. **Pane header strip: yes.** Built as an opt-in layout clone; a shipped layout is never edited.
2. **Fleet is a floating window** (draggable, remembers its place, opened from the chip or a key).
3. **The overlay built in Phase 2 is dropped** once the Brief exists. Its markdown subset renderer is replaced by `TextView.markdown`;
   the Story, Timeline and Session drawing is rewritten for the Brief tabs, so nothing of it is kept as a second view.
4. **Sound on needs-you: off by default**, a setting turns it on.
5. **"Since you left" = since the viewer last looked at that tab**, stored per viewer and per tab in the mod (`localStorage`).
6. **Split the GUI into several small files**, easy to read and change (section 10).
7. **UX review fixes all apply** (`ux-review` in the chat of 2026-11-08): flat Brief hierarchy, lane chips as the compact trigger, an
   anchored popover with the stepper inline, one colour per role (done is green, blue is only accent and links), status by shape and
   not by colour alone, contrast, a scalable timeline with day separators.

## 8b. The view is locked (2026-11-08)

The maintainer approved the rebuilt mockup (`ux-mockup/`, renders in `ux-mockup/shots/v2/`) as the final view. It is the source of
truth for the port: the real mod must match its layout, roles, colours, shapes, states and keys. Changes to the look need the
maintainer's word; the port may only change what the real app's API forces, and lists each such difference.

## 9. Risks

- Multi-file mods are supported (`main.js` plus `import ... from "./ui.js"` modules, as the shipped `win98` mod does), and one mod can serve several roles through `props().role`. Confirmed in the app guide on 2026-11-08; the U0 spike still proves it for our case.
- Pane header strips multiply per pane: each reads the same per-tab document (cheap) but must not each run timers; one shared timer
  through `shared()`.
- Fleet reads many documents: the index carries what the list needs, the card reads one document on selection.
- The context meter needs the context percent and window per lane: both are in document v2 lanes.
- Real-input behaviour (focus, keys, wheel) stays unverified until the maintainer's QA.

## 10. File layout of the real mod (the mockup mirrors it, so porting is a move, not a rewrite)

One mod, `tab-recap`, several roles chosen by `props().role` (`chip`, `strip`, `fleet`, `brief`); each file does one job and stays small.

```
tab-recap/gui/
  mod.json            places and sizes
  main.js             role router only: reads props().role, builds the right view
  constants.js        every magic value once: thresholds, widths, intervals, file names, status order, key names
  commands.js         every exec call (tab-recap-desktop ensure|refresh|stop|start|doc), argv built, never a shell string
  store.js            reads index.json and <tab>.json, watchFolder, one shared timer through shared()
  seen.js             per-viewer lastSeen per tab, the "since you last looked" computation
  derive.js           pure helpers: urgency order, timeline binning, headline choice, lane thresholds
  ui/                 icons, status shape, pill, meter, chip, button, kbd, hover card: small and reusable
  views/              brief, story, timeline, session (the Brief tab contents)
  roles/              chip, strip, fleet, window frame, popover (compact, handoff, settings later)
```

`derive.js` and `seen.js` are pure, so the render-tree test harness (section 7) tests them without the app.
