---
id: R-2026-11-07-02
name: "GUI host spikes: daemon start and typing"
question: "Can a mod start and keep the recap daemon through hc, which keys can hc type into an agent, and how does a claude terminal map to its session?"
date: 2026-11-07
owner: "crisap94"
method: live-probe
status: concluded
superseded_by: null
confidence: high
informs: [openspec/changes/gui-port]
tags: [herdr-app, hc, spike]
---

# GUI host spikes: daemon start and typing

## Question

Can a mod start and keep the tab-recap daemon through `hc`, which keys can `hc` type into an agent, and how does a claude terminal
map to its session? These were the open conditions of study R-2026-11-07-01 (findings 7 and 9, open question 3).

## Method

Live probes in a throwaway hc session (`HC_SESSION=sp` with scratch XDG directories) and a scratch herdr-app window
(`HERDR_APP_HOME`), so the live session was never touched. `scripts/isolated-env.sh` sets that up; `spike-daemon.sh` and
`spike-keys.sh` re-run the probes; `evidence/spike-results.txt` holds the output.

**Protocol (written before collecting):** daemon: start twice, restart the core, and start it from a mod's `init` through `exec`;
typing: send text and keys to a raw-mode program that logs the bytes it gets; session: read `hc get` for a live claude terminal and
look for a pid-keyed file. A spike passes if the observation matches the design's assumption. **Deviations:** typing was probed
with a byte logger, not with claude, codex or opencode, to spend no model tokens.

## Findings

| # | Finding | Evidence | Confidence |
| --- | --- | --- | --- |
| 1 | A mod's `exec` can start the daemon through `hc run --bg --keep --no-parent --name tab-recap-d`; a second start returns `name_taken`, so `ensure` is idempotent; the daemon survives `hc server restart`. | `evidence/spike-results.txt` 1, `evidence/floating-chip.png` | high |
| 2 | A mod copy starts when it first shows and stays alive while its block is in the layout. A `place: none` mod therefore starts only when opened; always-on work needs a block. | GUI guide "Mods" section; the chip stayed live in the floating block | high |
| 3 | In a scratch home neither `place: bottom` nor `place: right` docked a new mod into the main layout. A floating block added to `layouts/main.json` showed it. So the permanent button needs one layout edit by the person, and the first release stays overlay-first. | `evidence/spike-results.txt` 4 | medium (one layout, one version, no restart tried) |
| 4 | `hc send` delivers a bracketed paste then Enter; `hc keys` delivers raw keystrokes but only for letters, digits, space and `' , - . / ; = [ \ ] backtick`, and rejects `!"#$%&()*+:<>?@^_{|}~`. A command word can be typed, free guidance text cannot. | `evidence/spike-results.txt` 2 | high (bytes observed) |
| 5 | A claude terminal maps to its session through `foreground.pid` and `~/.claude/sessions/<pid>.json`. Not tried for codex and opencode. | `evidence/spike-results.txt` 3 | high for claude, none for the others |
| 6 | herdr-app already posts its own notification when an agent needs the person or finishes; a tab-recap toast would repeat it. | `herdr.d.ts` on `notify` | high |

## Options rejected and drawbacks

Probing with real agents now: rejected, it spends tokens to learn what a byte logger shows; the one open question it would settle
(does `/compact ` typed, then guidance pasted, then Enter run?) is a later task with the maintainer's agreement.

## Limits and threats to validity

One machine, one layout, Linux, herdr-app 0.1.18 window under a scratch home. Finding 3 may differ after a restart or with another
layout. Finding 4 describes `hc keys`, not any agent's reaction.

## Recommendation

Proceed as planned with three changes: keep compaction and handoff off in the GUI host's first release (finding 4); drop the
tab-recap toast and rely on herdr-app's own (finding 6); ship the permanent button as an optional layout recipe, with the overlay
reachable by `mod.open` and a key (finding 3). Session lookup for claude uses the pid file; codex and opencode fall back to cwd and
recency until probed.

## Open questions and follow-ups

1. Does the app dock a `place: right` mod after a restart? 2. Do codex and opencode leave a pid-keyed file? 3. Does `/compact ` typed,
then guidance pasted, then Enter run as a command in claude?
