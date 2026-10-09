# Proposal

## Why

Autocompact (2.2.0) decides only when a lane's agent becomes idle or done. Its first live hours showed what
that misses:

- **A lane that stays idle is never decided.** Panes sitting idle at 82 % and 84 % got no decision for hours,
  because no turn ended there. A daemon restart decided only the lanes whose status happened to settle at
  startup: 7 of the 11 lanes at or above the soft limit.
- **Finished background work can block a lane for good.** When the transcript tail holds the end notice of
  work launched before the tail, the reader answers `unknown`, which counts as in flight. Two lanes at 57 %
  and 60 % read so; the notices said `completed`. The answer also changes with how much of the file is read.
- **A gate that stops a lane leaves no trace.** Below the soft limit, in flight, cooldown, busy, no context:
  nothing is logged or stored, so "why was this pane not decided?" can only be answered by hand.
- **An offer reads as unfinished work.** A reply that delivers the result and ends by offering the operator
  a next step ("Want me to open the merge request?") was scored `announces_continuation` 0.80–0.85, so the
  lane waited. Nothing runs until the operator answers: that is a safe moment.
- **"Soft limit" is a minimum.** Below it nothing is evaluated; above it every safe moment compacts. The
  operator wants evaluation to start at 10 %, not 40 %.

## What Changes

- **Sweeps.** Shortly after the daemon starts, and every five minutes after that, autocompact considers every
  idle or done lane, one at a time, through the same gates. A lane is asked again only when something changed
  since its last decision: its tokens, the mode, or a daemon restart.
- **One automatic compaction at a time.** While an automatic compaction is requested or in progress for any
  lane, other lanes wait for the next sweep. A restart in `on` cannot start a burst.
- **The in-flight reader looks further back.** When the tail holds the end of work launched before it, the
  reader reads further back, up to a bound. Work whose end notice is read has ended; only work with no end
  counts. `unknown` remains only when the bound is reached and the question is still open.
- **Every stopped lane has a reason.** Each lane keeps its latest skip: the gate (`below-minimum`, `busy`,
  `in-flight`, `cooldown`, `unchanged`, `no-context`), its share and a detail. `tab-recap autocompact` lists
  the lanes not decided now and why.
- **An offer to the operator closes the request.** The question texts and criteria of `closes_request` and
  `announces_continuation` say so; fixtures pin it. A detailed choice between options still waits.
- **The minimum.** "Soft limit" becomes **Minimum** in the glossary, docs, settings and code. Its default
  becomes 10 %; `TAB_RECAP_AUTOCOMPACT_AT` keeps its name and range, so saved settings keep working. The
  settings row reads "Autocompact from".
- **Migration 011:** table `autocompact_skip`, one row per lane, with a readable view.

Out of scope:
- automatic compaction of Codex and opencode lanes;
- the operator's compaction flow (unchanged);
- event-driven wake-ups (the sweep uses the existing one-minute tick);
- changing the decider, its default or the verdict thresholds.

The merge request carries the label `changelog::changed`.
