# Design

## Context

In 2.2.0, `Dispatch.look` calls `settled(lane)` when a looked-at lane is idle or done, and
`Autocompact.consider` runs the gates. A lane is looked at when its status changes, so a lane that stays idle
is never considered again. The gates return silently for anything that is not `ask` or `ceiling`, and also
when the lane's context is unknown. The Claude in-flight reader reads the last 512 KB of the transcript. When
the tail holds an end notice whose launch it never saw and the read was truncated, it answers `unknown`,
because other work might have started before the tail.

## Decisions

### 1. A sweep on the daemon's existing tick

The daemon already ticks every minute (`RESYNC_MS`). A sweep runs on the first tick after start, then every
`SWEEP_EVERY` ticks (5, a named constant). It takes the lanes of the current board whose status is idle or
done and calls `consider` for each, awaiting one before the next. Sequential calls bound decider spend and
keep the log readable. A sweep that is still running when the next one is due is skipped, not stacked.

`setInterval` and the existing tick are reused; nothing hand-written replaces a built-in.

### 2. Ask again only when something changed

A lane whose last decision has the same tokens and the same mode, and was made by this daemon process, is
skipped with the gate `unchanged`. A restart counts as a change, so the first sweep after a start decides
every eligible lane once. Without this rule, an idle lane between the minimum and the ceiling would cost one
decider call per cooldown for as long as it stays idle (about $1.50 a day for 25 idle lanes). The rule also
stops a lane over the ceiling from requesting the same failed compaction again and again.

The rule is checked after the cheap gates and before the in-flight read.

### 3. One automatic compaction at a time

`busy` also holds when any lane has an automatic compaction in progress, or a `compact` decision in mode `on`
not yet linked to a compaction within the five-minute window. The lane is skipped with `busy` and the detail
"another lane", and the next sweep takes it. After a restart in `on`, lanes over the ceiling are compacted one
after another, not all at once.

### 4. The in-flight reader reads further back

When the truncated tail holds an end notice for a launch it never saw, the reader doubles the bytes it reads,
up to `IN_FLIGHT_MAX_BYTES` (16 MB) or the whole file, and scans again. Launches and ends are matched over
that larger read; an end notice with no launch in it ends nothing and opens nothing. The answer is `unknown`
only when the bound is reached, the file is larger still, and a notice in the read still has no launch. The
caller passes the reader a source and a starting budget, as now.

Reading more is rare: it happens only for a lane that passed every cheaper gate. The cost is one larger file
read through the existing `tailOf`.

### 5. The latest skip per lane, not a log of skips

Skips repeat on every sweep, so they are not appended. `autocompact_skip` holds one row per lane (primary key
tab and pane): the time, the agent, the gate, the share (null when unknown) and a short detail. A lane's row
is replaced at each skip and deleted when the lane gets a decision. Deleting a tab deletes its rows. The
daemon logs a skip line only when a lane's gate changes, so the log does not repeat every five minutes.

Gates recorded: `below-minimum`, `busy`, `in-flight` (detail: the count, or the reason for `unknown`),
`cooldown`, `unchanged`, `no-context` (the lane's context share is unknown). `off` records nothing.

### 6. An offer is not a continuation

`closes_request` gains in its criteria: the reply delivers the result and may end by offering the operator an
optional next step or asking whether to go on. `announces_continuation` gains: a next step that waits for the
operator's answer is not a continuation; only work the agent will start by itself, or a job it waits for,
is. `asks_detailed_choice` is unchanged: options whose details are only in the reply still wait. Each gets a
fixture pair: an offer ("…released. Want me to open the follow-up issue?") is yes for `closes_request` and no
for `announces_continuation`.

### 7. The minimum

The concept is renamed in `CONTEXT.md`, the READMEs, `config.example.env`, the settings rows and hints (en and
es), the spec, and the code (`soft` → `minimum`, gate `below-soft` → `below-minimum`). `SOFT_DEFAULT` becomes
`MINIMUM_DEFAULT = 10`. The variable `TAB_RECAP_AUTOCOMPACT_AT` and its 10–95 range are unchanged. The
ceiling stays above the minimum.

### 8. Listing

`tab-recap autocompact` prints the decisions as now, then a second block "not decided now", one line per
lane with a skip row: time, tab, pane, share, gate and detail, newest first.

## Risks

- **A sweep that asks many lanes after a restart.** Bounded by the sequential calls and by the minimum:
  about 25 lanes at roughly $0.0005 each.
- **A bigger read on every sweep for a blocked lane.** Bounded at 16 MB, and only for a lane that passed the
  cheaper gates: at most one such read per lane every five minutes.
