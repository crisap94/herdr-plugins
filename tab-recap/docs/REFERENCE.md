# Tab Recap reference

The full reference for Tab Recap: how the recap is kept, the expanded view, compaction, handoff, autocompact, the models,
the desktop app, the other tools and the state. The [README](../README.md) has the install and the commands; the
[user guide](../GUIDE.md) has the everyday use and the troubleshooting.

## Contents

- [What the recap is](#what-the-recap-is)
- [The expanded view](#the-expanded-view)
- [Chapters and retention](#chapters-and-retention)
- [How the recap is kept](#how-the-recap-is-kept)
- [Compaction](#compaction)
- [Handoff](#handoff)
- [Autocompact](#autocompact)
- [Models](#models)
- [How recaps are checked](#how-recaps-are-checked)
- [Your own command](#your-own-command)
- [Desktop app (herdr-app)](#desktop-app-herdr-app)
- [Platform notes](#platform-notes)
- [For other tools](#for-other-tools)
- [Configuration reference](#configuration-reference)
- [Recap runs](#recap-runs)
- [State and rolling back](#state-and-rolling-back)
- [Develop](#develop)

## What the recap is

The recap is a **ledger of facts**, each one line (16 words at most) in one of eight sections, always in the
same order in the column: Goal, Now, Needs you, Done, Decisions, Next, Links and Rules. An empty section
shows `—`. A fact keeps its identity: when it first appeared and was last confirmed, which turn it came
from, and — for a decision — its **reason**. At the end of a turn the writer is shown the facts that are
open (and the ones closed in the last two hours) and answers **operations**: `add` what is new, `update`
what changed, `close` what finished (`done`), was wrong (`wrong`), was replaced (`superseded`) or was
answered (`answered`). Nothing is regenerated, so nothing is rephrased turn after turn, and a closed fact
stays in the story with its reason.

- **The column and the bar** draw the open facts: the newest of each section, capped (the goal is one line;
  now 3, needs 3, done 5, decisions 3, next 5, links 6, rules 5). The caps are a rule of the *view*, enforced
  in code; the store keeps every fact.
- **The expanded view** (Enter or a tap) draws all of it — see below.
- **From 1.x:** migration 6 imports the lines your old recaps carried as facts (equal lines of a task across
  runs become one fact; the last good run's are open, the rest closed as `rewritten`); every task's column
  reads the same after the upgrade as before. The old `item` table is kept read-only.

## The expanded view

`tab-recap.show`, Enter in the column or a tap on the bar or the column opens the whole session from the
ledger, at once and with no model call. In order: the curator's *session so far* paragraph (when there is one),
**Goal**, **Now**, **Needs you** (oldest first, each with how long it has waited), **Timeline** (done facts
and every closed fact, newest first, with the time and, for a closed fact, why it closed; a date line when the
day changes), **Decisions** (the text, then its reason), **Next**, **Rules**, **Links** and **Session facts**:

```text
started 09:12 · 6 h 12 min          turns 41 (turn 36 · focus 3 · asked 2)
compactions 2 (800k → 14k · 39k → 3k) · chapters 3
claude · orchestrator  34 % of 1M   codex · host  12 % of 272k
repo herdr-plugins · branch main
files src/cart.ts (7), src/checkout.ts (5), …
```

The session facts are computed from the store and the agents' own records, never written by a model; a
fact that is not known is left out. From 140 cells wide the view has two columns (story left, reference
right); narrower, one column in that order. Scrolling and keys are the modal's: `j`/`k`, Space/`b`, `g`/`G`,
`r`, `c`, `s`, `q`/Esc.

**Breaks.** Where an agent compacted, the timeline draws a gray line across the column with the tokens
before and after and how long it took when the agent's records say so (`── compacted 800k → 14k · 16 s ──`;
`── compacted ──` when they do not, never a guess); where a new conversation began in the same pane it
draws `── new session ──`. See [Chapters](#chapters-and-retention).

**Session facts** are computed, never written by a model; the files edited most are counted from the agents' own
records, read-only (the most recent 4 MB of each).

![The expanded view](screens/expanded-en.png)

**The curator** is a job like the others (see [Models](#models)) that runs when the view opens and the facts changed
since it last ran, at most once per five minutes per task. It may close facts as *merged* into another and writes the
"session so far" paragraph shown at the top (at most 120 words); anything else it answers is refused and logged. The
view shows the last paragraph with its time and `updating…` while the curator runs, and never waits for it.

## Chapters and retention

A session breaks when an agent compacts its context or a new conversation starts in the same pane. After
each read of an agent's transcript the plugin records every compaction the agent's own records show that
is newer than the lane's last break — Claude's `compact_boundary`, Codex's `compacted` row, opencode's
compaction answer — as a **boundary** with the record's own time and tokens, and a new transcript in a pane that
had one as a `switched` boundary naming the transcript it replaces. A compaction is **manual** when the
plugin started one for that lane in the ten minutes before the record, else **auto**; a compaction the
plugin drove points at its boundary (`compaction.boundary_id`). A boundary seals the tab's current **chapter**
and opens the next in the same transaction; the run that follows belongs to it. A compaction the plugin did
not drive is only known at the next read, but its boundary carries the record's own time, so the timeline is
right even when it was recorded late. opencode's marks are tested on recorded fixtures only.

**Retention.** `TAB_RECAP_KEEP_DAYS` (default 30; `0` keeps everything): the daily upkeep removes a tab last
seen longer ago than that and with no column open, with its facts, runs, saved inputs, verdicts, chapters,
boundaries and compaction records — one transaction per tab, logged with the counts. A tab seen within the
period is never touched, whatever its size.

**Closed lanes.** When a lane leaves the board (its pane closed, its agent left the pane, or its agent kind changed
in the pane), the plugin records a **closure record** for it: the pane, the agent, the working directory, the close
instant and the task that lane produced in that stretch. `TAB_RECAP_CLOSED_LANE_DAYS` (default 14; `0` records
nothing and keeps no record) is how long those records stay. Within that window a closed lane's work can be handed
over with `tab-recap handoff --from-closed <pane> --tab <tab-id> --closed-at <epoch-ms>`; `--list-closed --tab <tab-id>`
lists the retained closures, newest first. A tab holding a closure record inside the window is not removed by
`TAB_RECAP_KEEP_DAYS`. Known limits: a run that finishes after the close is not attributed to the closed lane; a
`/clear` is not a closure (the live path still reaches its ledger); a crash that leaves a live shell in the pane is
not a closure while herdr still reports the pane as a lane.

## How the recap is kept

Since 2.0 a recap is not rewritten on every turn: it is a **ledger of facts** per task. A fact has an id, a
section (goal, now, needs, done, decisions, next, links, rules), a text of at most 16 words, a why (always for a
decision), an optional reference and agent, when it was first and last seen, and a state: *open*, or *closed* with
the reason — `done`, `wrong`, `superseded`, `answered` (the writer), `merged` or `rewritten` (the upkeep and the import).
Facts are never deleted.

**Writer's view.** `TAB_RECAP_WRITER_PRUNE=off` by default. When set to `on`, the writer sees every open `goal`, `now`,
`needs`, `decisions` and `rules` fact; the newest `TAB_RECAP_WRITER_KEEP_NEWEST` `done` and `links` facts per task
(default 10, range 1–50); and `next` facts seen within `TAB_RECAP_WRITER_NEXT_HOURS` (default 24, range 1–720), up
to the same newest-fact limit. A hidden count tells the writer how many open facts in each section it cannot see or
change. The curator continues to receive the full open ledger. It is off by default.

The writer is shown the task's open facts (and those closed in the last two hours) as `<ledger>` in the version 2
document, with ids `f1…fn`, plus only what is new in each transcript, and answers **operations** only:

```json
{"ops": [
  {"op": "add", "section": "done", "text": "Opened !34 for feat/cart", "why": null, "ref": "!34", "at": "16:41", "agent": "a1"},
  {"op": "update", "id": "f12", "text": "Merge !34 after the pipeline", "why": null},
  {"op": "close", "id": "f3", "why": "done"}
]}
```

Closes are applied first, then updates, then adds, in one transaction with the run. An operation naming an unknown id,
changing a closed fact, closing without a reason, adding a second goal, or adding what the ledger already says is
**refused**, sent back to the writer once with the reason, and dropped if it is still refused. `goal` is one open fact
per task: adding one closes the previous as `superseded`.

**Anchors.** Every `add` carries an `"anchor"`: at most 120 characters copied word for word from the turn, tool call or agent
note the fact comes from. A gate checks that the quote is in the input (whitespace and punctuation are folded, case is kept), so
"supported" is checked by code before the judge looks at it; the quote is stored with the fact and shown to the writer in the
ledger. An `update` may carry an anchor too; a `close` never does. A fact imported from 1.x has none.

The column, the bar and the modal draw, per task and section, the **newest open facts** under the same caps as always
(now 3, needs 3, done 5, decisions 3, next 5, links 6, rules 5, one goal). The caps only decide what is *shown*: the
database keeps every fact, and the compaction brief is written from all of them, closed ones with their reasons.

**Upgrading from 1.x:** the first start of 2.0 copies the database to `tab-recap.db.v5.bak`, then turns the stored
recaps into facts — equal lines of a task across runs become one fact with its first and last time, the last good run's
lines are open, the rest are closed as `rewritten`, a decision that never said why carries "(not recorded)". Every
column shows exactly what it showed before. The old `item` rows are kept, no longer written.

**Breaking, for a custom writer:** `TAB_RECAP_CUSTOM_CMD` now receives the version 2 document and must print the
`{"ops": [...]}` object above (one task: no `task` field; several: an `add` may carry `"task": "t2"`). A command that still
prints the old recap JSON makes the run fail with `custom writer must answer operations (see README)` in the log, and
nothing is stored: the old shape has no ids to operate on.

**Measure it:** `bun bin/tab-recap.ts eval --replay <transcript.jsonl> [--kind claude|codex] [--tab <label>]
[--compare-imported <tab>] [--pipeline one|enumerate|enumerate+gates|full]` reads a stored transcript from the start, runs the writer once per turn against a
scratch database in a temporary directory (the real one is never written), judges the facts it leaves with the judge job (the same
report as `eval --sample`, below), and prints the ledger it ends with. `--compare-imported` reads the tab's 1.x recaps from the
real database (read-only) and judges, **per chapter**, the last good 1.x recap of the chapter as one state against the replay's
ledger state at the same time — the same key facts, the same read-back questions, the same evidence (the chapter's turns, without
the ledgers the replay's own writer was shown) — and prints them side by side per chapter and summed. The report names the
pipeline, the writer job and the judge job, so two reports can be compared. With the judge job off it prints the checks that
need no model.

**How a turn is read.** The new turns of a run are not summarised in one call. They go through a *pipeline*
(`TAB_RECAP_PIPELINE`, default `one`):

1. **Enumerate.** A long turn is cut into chunks of at most 6 000 characters (between turns; inside a turn, between bursts of
   tool calls) and each chunk is read by one call at *low* effort that goes through every section and lists the facts it
   holds, each with a quote copied from the chunk (the *anchor*) — or none. Events a session is made of are never left to the
   model's attention: a `git commit`/`merge`/`push`/`tag`, `gh pr`/`release`, `glab mr`, an edit, an error (`Error`, `FAIL`, `✖`,
   `Traceback`) and a question found by plain code become *triggers* the call must either turn into a candidate or skip with a
   reason; a trigger it ignores still reaches the writer, flagged.
2. **Ask back** (`full` only). When the turn was long (more than one chunk) or the candidates are few (fewer than one per 2 000
   characters), the six read-back questions no candidate answers, and what changed about the open facts the turn mentions,
   drive one more enumeration restricted to those questions. Never a third.
3. **Reconcile.** The writer — the recap writer job, at its own effort — is given the candidates, the open facts and the
   newest turns for context, and answers the usual operations; a new fact is added only from a candidate, copying its anchor.
   The gates and the one correction retry work as before.

`TAB_RECAP_PIPELINE` takes `one` (the single call of 2.0 with the 2.1 gates, the default), `enumerate`, `enumerate+gates` or `full`; on
the 40-prompt replay of `experiments/EXP-001` the piped ones did not raise coverage or the read-back beyond `one` and cost 2.4–2.8× the
model calls, so they are off unless set; `tab-recap eval --replay
<file> --pipeline <name>` runs the same transcript through any of them, and its report names the pipeline, the writer, the
enumeration and the cost per turn, so two reports can be compared. A writer that is a custom command (`TAB_RECAP_CUSTOM_CMD`)
always takes the single call. When the enumeration fails the run takes the single call, so a turn is never lost.

**The ledger is reconciled.** Every `TAB_RECAP_RECONCILE_EVERY` turns (default 8), on the first run after a compaction and when
the expanded view opens after new turns, the curator job (see [Models](#models)) reads the open facts beside the newest turns
and may update a fact, close it (`done`, `wrong`, `superseded`, or `answered` — only for a *needs* fact) or merge it into another;
it never adds. Each update and close carries a quote of the turns that shows the change; one without a quote in the turns is
refused, so a fact is never closed because a summary the agent wrote after a compaction leaves it out. At most one such call per
task every five minutes.

## Compaction

`tab-recap.compact` (bind it, e.g. `prefix+shift+c`; or `c` in the column or the modal):

1. A popup asks for an optional note (up to 280 characters). Enter on an empty note sends without it; Esc cancels.
   Two ways skip the popup: `TAB_RECAP_COMPACT_NOTE=skip` (the setting; `ask` by default) queues the compaction at once
   with no note, and `tab-recap compact --note "<text>"` queues it at once with that note, whatever the setting says.
   `--note ""` queues with no note. A note is one line, at most 280 characters, as the popup keeps it; control characters
   are dropped (a tab or a newline becomes a space). A note that starts with `-` takes the `=` form: `--note=-x`.
2. The recap is refreshed. Then each target agent (`TAB_RECAP_COMPACT_TARGET`: `focused` by default,
   `all`, or kinds like `claude,codex`) that is **idle or done** gets a message written as your own
   instruction, in English, never naming the plugin, at most 3 000 characters. A **brief** writer (a
   model call, see [Models](#models)) reads the **whole session** — every fact of the agent's tasks, open and
   closed, with its reason, why it closed and its times, your note, the latest recap and the agent's last turns — and writes what the agent's own
   summary must keep, recall first: your note, the goal, decisions **with their reasons**, questions waiting for
   you, unfinished work with errors and failing tests, the standing rules you gave, and exact references; and
   to drop tool output, finished-step detail and resolved dead ends. Facts closed before the agent's last
   compaction are marked `settled="yes"` in the brief's input and named in one line as settled, so the agent's
   summary does not re-open them. A notification says it is being written.
   If the brief cannot be written (the job is `off`, no such CLI, a timeout, an answer that names the plugin),
   a template filled from the latest recap is used instead (references are trimmed first when it is too long;
   the note and the goal never), so compaction always happens. A word like `tab`, `recap` or `plugin` is
   refused in a brief only when the agent's own conversation never uses it (a session about a browser tab
   may say "tab"); the names `tab-recap` and `recap column` stay refused unless the conversation says them.
   The template obeys the same rule: a recap item that names the plugin is left out of it.
3. **claude** gets `/compact ` typed, then the guidance typed, then Enter — in pieces, so it runs as a command
   at any length (a pasted block, or one long send, would be taken as a message and never compact).
   **codex** and **opencode** run their own `/compact`, then get one short message with the same points that
   asks only for "ok".

After the command is sent, herdr's own push says when the agent is free again (idle or done); the flow
reacts to it at once (it polls only while the daemon is not hearing from herdr) and reads the agent's records
(read-only): Claude's `compact_boundary` row means it compacted, and carries the tokens before and after and
how long it took; an `Error during compaction` row (its own summarizer failed) means the same guidance is
typed once more; Codex's `compacted` row means it compacted (the context before and after come from the
`token_count` rows around it), and only then does it get the restore message. If the records say nothing yet
they are read again a moment later. The records are the ones of the session herdr reports for the agent's pane now,
so a new agent, or one resumed into a new session, is confirmed in its own session.

**One compaction per lane.** A lane has one compaction at a time, whatever asked for it (you, autocompact, or
another tool's `compact-req-<tool>` token). A request for a lane that is already queued or compacting joins that
compaction and starts no second one. The operator's toast says so (`already compacting: this request joins that
compaction`), and adds `, and its note is not used` when the joining request carried a note: the running compaction's
note stands. An automatic request that joins is not announced. Another tool's request is answered `queued` at once,
then with the running compaction's outcome and any later stages. If the running compaction throws, its requests are
answered `failed-error`. Autocompact sees such a lane as busy. A joined request is answered by this daemon only: if
the daemon restarts before the running compaction ends, the joined request keeps the answer `queued` until its token
expires.

**Progress on the lane.** Every compaction is a record in the database; the column, the phone bar and the
modal show its stage in the place of the `compact?` hint, with a clock from when the stage began:

| stage | the lane says |
| --- | --- |
| writing the brief | `✎ writing what to keep… (codex · gpt-6-luna · high) 0:08` |
| the command typed | `◐ compacting… 0:12` |
| codex / opencode, the reminder sent | `◐ telling it where things stand…` |
| confirmed | `✓ compacted 39.5k → 3.1k · 16 s` (`· template` when the template was sent) |
| failed | `✗ not compacted: …` |
| the agent is free and its records say nothing | `? not confirmed — check it` |
| the agent was busy | `– not compacted: working` |

A missing number is left out, never guessed. On the phone bar the headline says the same, with the agent
(`◐ compacting claude… 0:12`). The result stays until the agent's **next turn**; a newer compaction of the
lane replaces it, and a daemon that restarts mid-compaction leaves it as "not confirmed". Notifications are
two: when it starts, and when it ends with the numbers (`claude compacted: 39.5k → 3.1k tokens in 16 s`).

A working or blocked agent is skipped and a notification names it. Agents read from their screen, such as `gemini`,
are not offered compaction.

**The hint.** A lane whose context use reaches `TAB_RECAP_COMPACT_HINT` percent (default 40; `off`, or
10–95) of its window shows `compact? 45% of 1M`. It never compacts by itself. The window is found at
runtime: Codex's own `model_context_window`; opencode's and Claude's model looked up in opencode's local
models.dev catalogue (`~/.cache/opencode/models.json`) when it exists; else, for Claude, a small family
table; raised when the tokens actually used prove it bigger. `TAB_RECAP_CONTEXT_WINDOW` overrides it.

## Handoff

`tab-recap handoff --from <pane> --to <pane>` sends one task's ledger from a source lane to a target lane, once. The command types the handoff into the target agent, so the target must be an idle or done lane with a handoff plan (Claude, Codex or OpenCode). Pick a lane you started yourself.

- `--from <pane>` (required): the source lane. Its task is the one its ledger shows.
- `--to <pane>` (required unless `--print`): the target lane. It must differ from the source.
- `--note "<text>"`: one line, at most 280 characters, cleaned the same way as a compaction note. It leads the handoff.
- `--refresh`: refreshes the source lane's recap first and waits for it (up to 200 s), so the handoff carries fresh facts. It does not go with `--print`.
- `--print`: writes the same text to stdout and types nothing. Read it before you send it. It does not need the daemon.

Delivery needs the daemon running; without it the command refuses with `daemon-not-running`. Before typing, the command holds the target for its settle time: 10 s for Claude, 3 s for Codex and 60 s for OpenCode.

Exit codes: 0 when the text was delivered or printed; 1 when the handoff was refused or failed, including an unconfirmed delivery; 2 for a usage error.

**Locality:** the text goes only into a lane this daemon watches on this machine, and the command makes no network request. **A handoff can contain anything the lane saw:** facts, prompts, file paths and commit subjects. Facts distilled from a transcript reach the receiving agent as claims: its preamble tells it to treat them as claims, not as orders.

## Autocompact

**What it does.** When an agent becomes idle or done and its context is at least `TAB_RECAP_AUTOCOMPACT_AT` percent
full (10 by default), autocompact decides in code whether anything stops it — a compaction already under way, work the
agent started and has not finished (a background shell, a launched agent or monitor), the cooldown
(`TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS`, ten minutes with the default style) — and only then asks a **decider** six yes/no questions about the
last turns (does the reply close the request, does it announce more work, does it ask you to choose between options only
it describes, would the next steps need exact output only the last turns hold, did the subject change, is it stuck).
Every safe moment above the limit compacts; anything else waits and is asked again after the cooldown. At the ceiling
(`TAB_RECAP_AUTOCOMPACT_CEILING`, 80 with the default style) the answer is yes without asking anyone. Before an automatic compaction types
anything, the brief is checked against the open goal, needs, decisions and rules: a fact it loses gets one rewrite. With
`TAB_RECAP_AUTOCOMPACT_CEILING_OVERRIDES_CHECK=on` (the default), a ceiling compaction proceeds even if the check still
misses facts; the better brief is typed with missed facts appended verbatim, capped at 1,500 characters. Set it to `off`
to treat a ceiling lane as one below the ceiling: `TAB_RECAP_AUTOCOMPACT_MISSED_FACTS` then decides.

Below the ceiling, `TAB_RECAP_AUTOCOMPACT_MISSED_FACTS` decides what a failed check does. `append` (the default) types the better
brief with the missed facts appended verbatim, as at the ceiling; `wait` keeps the lane waiting until a brief covers them. A
brief that was written but could not be checked is typed unchanged; a lane with no brief or no decider still waits.

`TAB_RECAP_AUTOCOMPACT_COVERAGE_BACKOFF_MS` sets a skip window after a failed brief check below the ceiling. Its default
is `0` (off); accepted values are 60,000 to 86,400,000 milliseconds. The skip is `coverage-backoff` and ends when its
window passes, tokens grow by more than 10% of the context window, or a compaction boundary occurs. Checked briefs and
the facts they were checked against are retained for 14 days by default; `TAB_RECAP_KEEP_BRIEF_DAYS` accepts 0 to 60,
where 0 keeps none.

**Styles.** `TAB_RECAP_AUTOCOMPACT_STYLE` sets how eagerly autocompact acts. `balanced` (the default) is the numbers
above; `gentle` waits for a clearer moment; `eager` acts sooner and asks an idle lane again. The settings modal's
«Autocompact style» row writes it.

| | `gentle` | `balanced` (default) | `eager` |
| --- | --- | --- | --- |
| verdict: warnings at most | 0.20 | 0.30 | 0.40 |
| verdict: closes / changes subject at least | 0.80 | 0.70 | 0.60 |
| undecided band | 0.30–0.70 | 0.35–0.65 | 0.45–0.55 |
| brief check pass mark | 0.75 | 0.70 | 0.60 |
| ceiling (when `TAB_RECAP_AUTOCOMPACT_CEILING` is unset) | 85 | 80 | 65 |
| cooldown (when `TAB_RECAP_AUTOCOMPACT_COOLDOWN_MS` is unset) | 20 min | 10 min | 5 min |
| ask a `wait` (or `undecided`) lane again after it stays idle, even unchanged | never | never | after 30 min |

The re-check asks an idle lane again after its last decision was a `wait` (or `undecided`) and its tokens have not
changed. A `compact` decision is never re-asked. Every re-check is one decider call, in `shadow` too: an eager lane
left idle for an hour is asked twice, and keeps being asked every 30 minutes for as long as it stays idle. That is
the cost of `eager`; the default styles never re-check unless `TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS` is set.

An explicit key always wins over the style. Four advanced keys set the numbers themselves, each in its range, and an
out-of-range or invalid value is the style's number: `TAB_RECAP_AUTOCOMPACT_SAFE_AT_MOST` (0.05–0.50),
`TAB_RECAP_AUTOCOMPACT_CLOSES_AT_LEAST` (0.50–0.95), `TAB_RECAP_AUTOCOMPACT_COVERAGE_AT_LEAST` (0.30–0.95) and
`TAB_RECAP_AUTOCOMPACT_RECHECK_IDLE_MS` (60000–86400000; the re-check interval, which any style may set). The two
verdict keys must stay outside the undecided band: `SAFE_AT_MOST` below the band's start and `CLOSES_AT_LEAST` above its
end. Otherwise the style's number is used, so no answer inside the band can be `compact`. The band itself follows the
style. `tab-recap autocompact` prints the style and its numbers before the decisions. The settings modal cannot show
an explicit `TAB_RECAP_AUTOCOMPACT_CEILING` or `_COOLDOWN_MS` in `config.env`, and such a line overrides the row's
style: if the row seems to do nothing, check those two lines.

**Shadow first.** `TAB_RECAP_AUTOCOMPACT` is `shadow` by default: every decision is recorded and logged, nothing is
ever typed. Read what it would have done with `tab-recap autocompact` (the newest twenty decisions, with the last
day's cost), then set `on`. `off` decides nothing. Only Claude agents are compacted (`TAB_RECAP_AUTOCOMPACT_KINDS`);
other kinds are decided and recorded, never compacted. Set `TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS=codex,opencode` to
force those readers to record decisions with mode `shadow`, even if they are added to `TAB_RECAP_AUTOCOMPACT_KINDS`;
their decisions appear in the same `tab-recap autocompact` list. Held-lane skips, including in-flight skips, are in
`daemon.log` in the state directory (its path is printed by `tab-recap.status`). The setting defaults to empty. An
automatic compaction goes through the same path as yours and is marked `(auto)` in its notification, and the expanded
view's session facts count the tab's compactions by origin
(`compactions 4 (3 by you · 1 auto)`).

**The decider** is a job like the others: `TAB_RECAP_AUTOCOMPACT_BY` is `recap` (the recap writer's harness, the
default, at `low` effort), `auto`, a harness name, `jev` (the TypeSafe System One API) or `off`; `_MODEL` and `_EFFORT`
as for the other jobs. The brief check has its own choice, `TAB_RECAP_AUTOCOMPACT_COVERAGE_BY`: `auto` (the default: Jev when
a key is found by the key chain below, else the moment decider), `jev` (always; with no key the check cannot run, so the
compaction waits) or `decider` (the moment decider). `auto` (the default) sends the brief and its facts to the remote Jev service as soon as a TypeSafe key is found, whatever `TAB_RECAP_AUTOCOMPACT_BY` says; set `decider` to keep the check on your own harness. With `jev`, the last prompt and reply, the recent turns, the goal and the open work are sent to that service, and the
brief and its facts too when the brief is checked. `jev` posts to `TAB_RECAP_JEV_URL` (`https://`, or `http://` to
loopback only; any compatible gateway) with the model `TAB_RECAP_JEV_MODEL` and a bearer key, read each time from `TAB_RECAP_JEV_KEY` (the environment or `config.env`), else `TYPESAFE_API_KEY`,
else the file `~/.config/typesafe-api-key`. The key is never logged, stored, shown in the settings modal or put in an
error. If the decider cannot answer, the decision is recorded as unknown and acts as a wait; one log line says so per
outage, and the ceiling still compacts.

**Cost.** A decision is one short call, about a thousand input tokens: a fraction of a cent with `jev`, plan usage with
a harness. Each decision stores its cost, and `tab-recap autocompact` sums the last 24 hours.

## Models

Every model call is a **job** run on one harness (`claude`, `codex`, `opencode` or your own
command) with a model and an effort. The settings modal lists them under **Models**, one row per job showing
`harness · model · effort`; ←/→ pick a part, Enter edits it.

| job | harness | model | effort |
| --- | --- | --- | --- |
| recap writer | `TAB_RECAP_BACKEND` (`auto`) | `TAB_RECAP_MODEL_<HARNESS>` | `TAB_RECAP_EFFORT` (`medium`) |
| compaction brief | `TAB_RECAP_COMPACT_BY` (`recap` = the recap writer's harness; or `auto`, a harness, `off` = template only) | `TAB_RECAP_COMPACT_MODEL` (empty = the harness's configured model) | `TAB_RECAP_COMPACT_EFFORT` (`high`) |
| recap judge | `TAB_RECAP_JUDGE_BY` (`recap` = the recap writer's harness; or `auto`, a harness, `off`) | `TAB_RECAP_JUDGE_MODEL` (empty = the recap writer's model for that harness) | `TAB_RECAP_JUDGE_EFFORT` (`medium`) |
| curator (the story, and the reconciliation of the ledger) | `TAB_RECAP_CURATE_BY` (`recap` = the recap writer's harness; or `auto`, a harness, `off` = no paragraph, no merges, no reconciliation) | `TAB_RECAP_CURATE_MODEL` (empty = the harness's configured model) | `TAB_RECAP_CURATE_EFFORT` (`medium`) |

The enumeration of a run (see [How a turn is read](#how-the-recap-is-kept)) is not a job of its own: it runs on the recap writer's harness and model at `low` effort.

Efforts: `low` · `medium` · `high` · `default` (pass nothing). Every harness runs with no tools, no user
settings or MCP and no session left behind. The judge runs only when you run `tab-recap eval` (below).

### Job telemetry tags

`TAB_RECAP_TELEMETRY_TAGS=on` adds the constant OpenTelemetry resource attribute `tab_recap.job` to Claude and Codex child jobs. It defaults to `off`. Values are `recap-writer` (including enumeration), `compaction-brief`, `curator`, `judge`, `decider`, and `coverage-check`. OpenCode, custom commands, remote HTTP decisions, and experiment tools are not tagged. The attribute contains no prompt, session, path, or model data. The setup modal shows this setting and respects an environment lock.

Claude's telemetry and `OTEL_*` variables must be present in the daemon environment. The Claude CLI is launched with an empty setting source list, so telemetry variables in Claude settings files are not a supported source. For Codex, configure exporters in its configuration under the inherited `CODEX_HOME`. Any Codex OTel environment variables used, such as exporter headers, must also be present in the daemon environment.

Collectors determine whether resource attributes become metric labels or are exposed through a resource information metric. Prometheus-style names are illustrative: `tab_recap.job` is commonly normalized to `tab_recap_job`, and metric units and `_total` suffixes vary by exporter. If a resource attribute is promoted to a label, Claude cost and token series can be queried as:

```promql
sum by (tab_recap_job) (increase(claude_code_cost_usage_USD_total{tab_recap_job=~".+"}[1h]))
sum by (tab_recap_job, type) (increase(claude_code_token_usage_tokens_total{tab_recap_job=~".+"}[1h]))
```

Untagged series, such as jobs run with tagging off or other emitters, carry an empty `tab_recap_job` label. Select them by matching the empty value exactly:

```promql
sum(increase(claude_code_cost_usage_USD_total{tab_recap_job=""}[1h]))
```

An absent or empty label may select the whole fleet when the collector did not promote the resource attribute. If it exposes `target_info`, join the resource attribute instead; join keys depend on the collector:

```promql
sum by (tab_recap_job) (increase(claude_code_cost_usage_USD_total[1h]) * on (job, instance) group_left (tab_recap_job) target_info{tab_recap_job=~".+"})
```

Codex 0.162.1 emitted `codex.turn.token_usage` as a delta histogram with the job attribute on log and metric resources. Convert delta points to cumulative temporality before using `increase` on the cumulative sum:

```promql
sum by (tab_recap_job, model, token_type) (increase(codex_turn_token_usage_sum{tab_recap_job=~".+"}[1h]))
```

A delta-native backend needs its own range sum query. With tagging off, the fallback filter below selects the default `codex_exec` entry point, but it cannot prove a call belongs to this plugin because interactive `exec` calls can share those attributes:

```promql
sum by (job, originator, session_source, model, token_type) (codex_turn_token_usage_sum{job="codex_exec", originator="codex_exec", session_source="exec"})
```

Codex metrics require `[analytics] enabled = true` and an OTLP metrics exporter table. Without an OTLP metrics exporter, metrics go to a vendor analytics endpoint. A configured Codex OTel exporter also sends a turn-id-only request with no content to the model provider. Codex exposes token metrics, not cost. An estimate would use `Σ model ((input − cached_input) × p_in + cached_input × p_cached + cache_write_input × p_write + output × p_out)`. This assumes cached input is included in input, cache-write input is separately billable, and reasoning output is included in output and billed at `p_out`. Those overlaps have not been verified for this build. If reasoning output is additive, its count must be added at `p_out`; never add `token_type="total"` to component counts. This plugin publishes no Codex cost estimate or price table.

## How recaps are checked

Three things keep a recap's items worth reading, none of them a second model call on every turn.

**The rubric.** [`schema/recap-rubric.md`](../schema/recap-rubric.md) is one file of yes/no checks: seven for every item
(atomic, stands alone, specific, supported by the input, about the work and not the agent, new, still true) and one per
section (a goal is an outcome, a decision carries its reason, a link resolves, …), each with a pass and a fail example.
The writer's instructions and the judge's instructions quote it verbatim, so the writer is asked for exactly what the judge checks;
edit a check in the file and both carry the new wording.

**Gates.** Before a recap is stored every operation passes plain-code rules, no model involved. Only what would corrupt the ledger is
**refused**: a fact whose subject is an agent (`claude completed the research…`), a decision that gives no reason, an add that repeats
another fact of the task (word overlap of 0.6 or more), an operation on an id the ledger does not hold, a close without a reason,
an add whose anchor is missing or not in the input, and a close as `answered` of anything that is not a question (a *needs* fact).
Facts that only look wrong are **flagged** and kept, so recall is not lost to a matter of form: a link that is not a reference
(`!n`, `#n`, a SHA, a path, a URL, `name/with-slash`; it is drawn without a hyperlink), a fact in the wrong language, one that names
nothing concrete and one that opens with a pronoun. The refused operations go back to the writer **once**, alone: a short
`<correction_input>` (see [`schema/correction-input.dtd`](../schema/correction-input.dtd)) holds each of them with the rule that
refused it and the facts it names — not the transcript — and the writer answers replacements for those only; what is still refused
after that is dropped, the rest is applied. The counts per gate are stored with the run: `tab-recap eval --gates [--since <days>]`
prints them.

**The judge.** `tab-recap eval` scores stored recaps against the rubric using the judge job (above). It needs each run's input, which
the plugin keeps, compressed, for `TAB_RECAP_KEEP_INPUT_DAYS` days (default 14; `0` keeps none; older ones are deleted once a day, the
runs stay).

| command | does |
| --- | --- |
| `tab-recap eval [--sample <n>] [--tab <id>] [--since <days>]` | judges the newest `n` runs (default 20) with a stored input. The item checks (I1–I7 and the section's) are scored on the facts the run **added**, each with a one-line critique when it fails. Coverage (the share of the input's key facts the recap carries), no-filler (the share of facts tied to a key fact) and a read-back — a fresh call answers six fixed questions (goal, what finished, what waits on you, what must not be done, why a decision was taken, next action) from the recap alone, and its answers are graded against the input — are measured on the **ledger's state** after the run (everything open then, what earlier runs added too), with the numbers over the run's own additions in brackets beside them. Facts whose anchor is in the input but that the judge calls unsupported are listed under "judge vs anchor". Verdicts are stored. Exit 1 when no harness is available for the judge, or every run failed to be judged |
| `tab-recap eval --label <n> [--check <I1…I7\|S-section>]` | shows `n` items you have not labelled, newest first; answer `ok`, `fail` (every check fails) or `fail I3 S-done` (those fail, the rest pass), then a reason; `skip` and `quit` also work. With `--check I5` only that check is asked (the fastest way to fix a weak one), including for items you labelled on other checks |
| `tab-recap eval --agree` | per check, how often the judge and you agree on the same items, with false passes and false fails, Cohen's kappa beside the 0.6 bar (a check under it is yellow) and the three newest items they disagree on |
| `tab-recap eval --gates [--since <days>]` | the gates' counts per gate, with no model call |
| `tab-recap eval --replay <file> [--kind claude\|codex] [--tab <label>] [--compare-imported <tab>] [--pipeline one\|enumerate\|enumerate+gates\|full] [--prune]` | runs the writer over a stored transcript, one turn at a time, on a scratch ledger; `--prune` uses the configured K and hours (see [How the recap is kept](#how-the-recap-is-kept)) |

`--json` prints the report as JSON. `--label`, `--agree` and `--gates` exclude each other and `--sample`; `--replay` excludes all of them. A judge on the same model as
the writer may favour the writer's wording, so label some items yourself and look at `--agree` before trusting its numbers; the judge job
can run on another harness. **Calibration:** where you overruled the judge, its next scoring instructions carry up to five of your
corrections for that check (the item, your verdict, your reason, newest first) as anchors — "when in doubt, the operator decided like this".

### Your own command

`TAB_RECAP_BACKEND=custom` with `TAB_RECAP_CUSTOM_CMD` (a command line, no shell) reads the prompt — the
version 2 document, then the instructions — on stdin and prints the operations on stdout:

```json
{"ops": [
  {"op": "add", "section": "decisions", "text": "Keep SQLite", "why": "it needs no server", "ref": null, "at": "16:41", "agent": "a1", "anchor": "no server, SQLite is fine"},
  {"op": "update", "id": "f12", "text": "Canary at 10% of traffic", "why": null},
  {"op": "close", "id": "f3", "why": "done"}
]}
```

`id` is the `f…` of a `<fact>` in the document's `<ledger>` (with several tasks an `add` may carry `"task": "t2"`; `{"ops": []}` means nothing changed); `close` takes `done`, `wrong`, `superseded` or
`answered`. An answer the ledger cannot apply (an unknown id, an update of a closed fact, a second goal in one
answer) is refused with its reason, and the refusals go back to the command once: it is run again with a `<correction_input>` document
(not the transcript) holding each refused operation with its reasons, and must print `{"ops": [...]}` with the replacements only.
**New in 2.1:** an `add` may carry an `"anchor"` — a quote of at most 120 characters copied word for word from a turn, tool call or note of
the document. For a custom command it is optional: an add without one is kept (the built-in harnesses must quote, and an add whose
quote is not in the document is refused); a fact without an anchor is just not counted under "judge vs anchor" by `tab-recap eval`.

**Breaking in 2.0:** until 1.x a custom command received the previous recap and answered the whole recap
as JSON. It now receives the version 2 document and **must answer operations**; a command that still answers
the recap JSON (`{"goal": …}`) is refused: the run fails with `custom writer must answer operations (see README)` in
`daemon.log` and nothing is stored. There is no compatibility shim — the recap JSON has no ids to operate on.
Built-in harnesses are not affected.


## Desktop app (herdr-app)

The same engine also runs for the Herdr desktop app (`herdr-app`, on `herdr-core`). There is no column there. A small mod draws the
recap in the app, and a separate daemon (the same engine, started with the desktop frontend) writes what the mod reads. The terminal
UI is unchanged and both share one version. The daemon starts with every column hidden, so it never opens a pane.

### Start and stop

```bash
tab-recap-desktop ensure          # the mod runs this itself; starts the daemon unless it runs or was stopped
tab-recap-desktop start           # clears a stop and starts the daemon
tab-recap-desktop stop            # stops it and keeps it off until start
tab-recap-desktop status          # daemon and state folder
tab-recap-desktop refresh <tab>   # ask for a new recap of a tab
tab-recap-desktop doc <tab>       # the same document the mod reads, on stdout
```

The state folder is `$TAB_RECAP_STATE`, else `desktop/` under the plugin's state folder
(`~/.local/state/herdr/plugins/tab-recap/desktop` on Linux). The daemon keeps its database, pidfile and log there, and writes the
files for the mod to `<state>/gui/`: `index.json` (one row per tab) and one `<tab>.json` per tab (the version 2 document, under 1 MiB).
A recap is written only for a tab with an agent in it, after the agent finishes a turn.

### How the daemon reads the agents

The daemon keeps one connection to the herdr-core socket (newline-delimited JSON-RPC 2.0) and one events subscription, folds each event
into a roster in memory and spawns nothing. The socket is `$HC_SOCKET`, else `$XDG_RUNTIME_DIR/herdr-core/<session>.sock`
(`$XDG_RUNTIME_DIR` falls back to `/run/user/<uid>`; the session is `$HC_SESSION`, else `default`).
If the core goes away the daemon says so in its log, reconnects with a growing wait (500 ms up to 15 s), and takes a fresh snapshot
when the core is back.

| Setting | Values | Does |
| --- | --- | --- |
| `TAB_RECAP_API` | `off` | Do not start the local API; the mod then reads the files only. |

`TAB_RECAP_API` is read when the daemon starts, so restart the daemon after changing it.

### The local API

The daemon serves a small HTTP API for the mod, on `127.0.0.1` and a port the system picks. On start it writes
`<state>/gui/api.json` with mode 0600, `{"version":1,"port":…,"token":…,"pid":…,"startedAt":…}`, and removes it when it stops. A client reads
that file, then sends `Authorization: Bearer <token>`. Every route but `GET /v1/health` needs the token. The `Host` header must be
`127.0.0.1:<port>` or `localhost:<port>`, so a web page cannot reach it through a rebinding trick. The server sends no CORS headers and
reads at most 64 KiB of request. Every body is JSON; `schema/desktop-api.v1.schema.json` has one definition per response.
`GET /v1/health` answers only `{ok, version, pid, startedAt, seq}`, so a client can match `pid` and `startedAt` against `api.json`
before it sends the token anywhere.

| Route | Does | Success | Errors (`{"error": "<name>"}`) |
| --- | --- | --- | --- |
| `GET /v1/health` | liveness; no token | 200 `{ok, version, pid, startedAt, seq}` | 403 `bad-host` |
| `GET /v1/index` | one row per tab | 200 `{version, tabs}` | |
| `GET /v1/tabs/:tab` | the tab's document | 200 | 404 `unknown-tab` |
| `GET /v1/events?since=N&wait=S` | long poll; `wait` defaults to 25 s and is capped at 28 s | 200 `{seq, epoch, reset, events:[{seq, topic, tab, at}]}`; `reset: true` when `since` is older than the last 500 events or ahead of the daemon | 400 `bad-request` |
| `POST /v1/tabs/:tab/refresh` | queue a new recap | 202 `{queued: true}` | 404 `unknown-tab` |
| `PUT /v1/tabs/:tab/open` | say the tab is being looked at; a 60 s lease, renew before it ends | 204 | 404 `unknown-tab`; 429 `too-many-leases` (256 held) |
| `DELETE /v1/tabs/:tab/open` | drop the lease | 204 | 404 `unknown-tab` |
| `POST /v1/tabs/:tab/needs/:id/answer` | close a waiting item by hand | 200 `{answered: true, id}` | 404 `unknown-tab`, `unknown-need`; 409 `not-a-need`, `not-open`; 400 `bad-request` |
| `GET /v1/tabs/:tab/compact-message?pane=&note=` | the guidance the engine would send with `/compact`; no model call, nothing written | 200 `{kind: "guidance", model: false, text, limit: 3000, noteLimit: 280}` | 404 `unknown-tab`, `unknown-pane`; 400 `bad-request`, `note-too-long` |
| `GET /v1/tabs/:tab/handoff-message?from=&to=` | the text `handoff --print` shows for a lane (and a second lane) | 200 `{kind: "handoff", text}` | 404 `unknown-tab`, `unknown-pane`; 409 `handoff-refused` (`detail` says why); 400 `bad-request` |

Any route can also answer 401 `unauthorized`, 403 `bad-host`, 404 `not-found`, 405 `method-not-allowed`, 413 `payload-too-large`,
500 `internal` (with a `detail`) or 503 `unavailable`. `topic` is `index`, `tab` or `notice`; `notice` has no producer yet. `epoch` is
the daemon's start time: when it changes between two answers the daemon restarted and the client should read everything again.

### The files, as the fallback

The files in `<state>/gui/` are written on every change, with or without the API, so the mod works if the API is off or the daemon
restarts. With the API down the mod watches the folder, re-reads every 15 seconds, and keeps trying `api.json` to switch back. A tab being
looked at is marked by an empty `open.<tab>` file there (renewed every 20 seconds, treated as closed after 60) instead of a lease.

### What the mod shows

Install it by copying [`desktop/mods/tab-recap/`](../../desktop/mods/tab-recap/RECIPE.md) to `~/.config/herdr-app/mods/tab-recap/`; the recipe has the key binding and the
optional layout blocks. One mod, four roles:

- **Chip:** how many tabs need you and how many are working, with the worst status. A click opens Fleet.
- **Strip:** a pane header with the status, a headline, a context meter with the compaction hint, and a pill while a compaction runs.
- **Fleet:** every tab by urgency, with filters, search and a meter per row.
- **Brief:** one tab: Brief, Story, Timeline and Session views, the lane chips, a "since you last looked" banner, the waiting item
  with **Mark done**, and the **Compact message** popup with **Copy** and **Copy handoff**.

Mark done asks for a confirmation, then closes the waiting item in the engine (`why` is `answered`), so the terminal UI shows it closed too.
The compact message is the engine's own guidance for the lane with an optional note of up to 280 characters; Copy puts exactly that
text on the clipboard. Both buttons need the API.


## Platform notes

### macOS

If `prefix+r` does nothing, run `tab-recap.status` first: it prints the Bun that runs the plugin and which keys herdr has bound to a `tab-recap.*` action (or `no key bound — see README`).

- **No key is bound out of the box.** Add the bindings above to your config; on macOS it is `~/.config/herdr/config.toml` too (not `~/Library/Application Support`), or `$HERDR_CONFIG_PATH`. Then `herdr server reload-config`; `prefix+?` lists the active keys.
- **The default prefix is `ctrl+b`**: press it, release, then `r`. A custom `[keys] prefix` changes that.
- **Bun ≥ 1.4.4 must be on the PATH of herdr's *server,** not just of your shell. Homebrew (`/opt/homebrew/bin`), `~/.bun/bin` and mise shims are often only on an interactive shell's PATH, so an action fails with `bun: not found` or runs an older Bun (it cannot run `.ts`). Fix: install Bun (`brew install oven-sh/bun/bun`, `mise use -g bun`, or `curl -fsSL https://bun.sh/install | bash`), `herdr server stop`, open a new terminal where `bun --version` is ≥ 1.4.4, and start `herdr` from it. If herdr is started from a launcher: `launchctl setenv PATH "/opt/homebrew/bin:$PATH"` and restart it.
  With a Bun too old, the plugin says so instead of failing silently: the column, the settings and the compaction popup show the version found, the one required, the path of the `bun` used and the steps **for your OS** (macOS: Homebrew and `launchctl`; Linux: the curl installer or mise); a command prints them and exits 1; the daemon writes one dated line to `daemon.log`. `tab-recap.status` reports it and goes on. A Bun too old to run `.ts` prints the same message in English.
- **Prefer `ctrl+alt` over plain `alt`:** macOS composes `alt+key` into special characters; `key = "ctrl+alt+r"` is safe and needs no prefix.

Read-only diagnosis (run the last two inside a herdr pane):

```bash
herdr --version; herdr plugin list | grep -i tab-recap
herdr plugin action list | grep tab-recap.column || echo "missing: update the plugin (>= 1.1.0)"
CFG="${HERDR_CONFIG_PATH:-$HOME/.config/herdr/config.toml}"; grep -n -B2 -A3 'tab-recap' "$CFG" || echo "no tab-recap binding in $CFG"
command -v bun; bun --version
SP=$(pgrep -f 'herdr.*server' | head -1); ps eww -p "$SP" | tr ' ' '\n' | grep '^PATH='     # the server's PATH
herdr plugin action invoke tab-recap.status
herdr plugin log list --plugin tab-recap | tail -30
```


## For other tools

tab-recap talks to other tools through herdr's pane tokens and events alone: no command, no file, no socket of its own. Sharing is
off unless `TAB_RECAP_HERDR_EVENTS=on`; with it off, nothing below is written and no request is answered. The typing lease and the
`awaiting` and `note` tokens of other tools are honoured either way.

**Tokens tab-recap writes** (`tab-recap-*` and `typing-tab-recap` only, and nothing else):

| token | value | when |
| --- | --- | --- |
| `tab-recap-api` | `1`, the protocol version | with the lane's other lane tokens |
| `tab-recap-x` | `compact1,kinds2`, the exchanges and kinds offered (see below) | with the lane's other lane tokens |
| `tab-recap-share` | the context share, in percent | when it changes |
| `tab-recap-recap` | epoch ms of the tab's last recap | when a recap is written |
| `tab-recap-needs` | the number of open needs of the tab | when it changes |
| `tab-recap-compact` | `<id>:<stage>`, the answer to a request | as the compaction goes |
| `tab-recap-handoff` | `<id>:<stage>`, the answer to a `handoff-req-<tool>` request (only with `TAB_RECAP_HANDOFF_REQUESTS=on`) | as the handoff goes |
| `tab-recap-event` | `<seq>:<kind>[:<detail>]`, one event | for each event of the lane (`lane-closed` goes to the workspace) |
| `typing-tab-recap` | epoch ms of tab-recap's typing lease | while it types into the pane, whatever the setting |

Lane tokens live two minutes and are rewritten when they change or half their life has passed; an answer or an event lives an hour;
the lease lives a minute. A lane that leaves the board has its lane tokens cleared. Turning the setting off clears `tab-recap-event` on
every pane and workspace that carried one, and the lane tokens on every lane.

**Requests another tool may write** on a lane's pane: `compact-req-<tool>` = `<id>` or `<id>:<note>` (the note is the focus of the
brief, cut to fit). tab-recap answers in `tab-recap-compact`: `<id>:queued`, then `running`, then `done` or `failed-<reason>`;
`failed-not-a-lane` when the pane is not a lane; `failed-busy` when the agent is working; `failed-lane-busy` when a handoff holds the lane; `failed-skipped` when it is not ready (blocked, or the brief does not cover the facts); `failed-error` for any other cause; `failed-interrupted` when a restart stopped it. Each id is acted on once, also across
restarts: the same id written again asks for nothing. A request seen while the setting is off is remembered and never acted on, even
after it goes on. A request a restart interrupts while the setting is on is answered `failed-interrupted`; one interrupted while it is
off is not answered.

**Limits.** An id is 1 to 16 characters; `compact-req-<tool>` is at most 32 characters, so `<tool>` is at most 20. An empty id or a longer
one is answered `failed-bad-id` with its first 16 characters. A note is plain text: control characters become spaces and it is cut to fit.

**Handoff requests** are opt-in: `TAB_RECAP_HANDOFF_REQUESTS=on` (`off` by default) needs `TAB_RECAP_HERDR_EVENTS=on`, and with
either setting off no `handoff-req-<tool>` is answered. A tool writes `handoff-req-<tool>` = `<id>:<workspace>:<pane>` (or
`<id>:<workspace>:<pane>:refresh` to refresh the source agent's context first) on the source lane's pane. The id is 1 to 16
characters of `[A-Za-z0-9_-]`; the workspace and the pane are each `[A-Za-z0-9]+`, and the target must be a lane in the source
lane's workspace. The request carries no text: tab-recap builds the handoff from its own ledger, and a note stays the operator's.
tab-recap answers in `tab-recap-handoff` = `<id>:<stage>`: `queued`, `running`, then `delivered`, or `refused-<reason>`,
`unsupported-<reason>` or `failed-<reason>`. The exchange itself refuses with `refused-not-offered` (sharing on, the setting off),
`refused-bad-request`, `refused-not-a-lane` and `refused-target-elsewhere`, and writes no row for those. The published deadline is
200 000 ms from `queued` to a terminal stage; a request taken later than 30 000 ms after it was queued is answered
`failed-expired` and nothing is typed. A restart that interrupts an ask writes `failed-interrupted`, and an interrupted request
is never delivered late. The events are `handoff-queued`, `handoff-running`, `handoff-delivered` and `handoff-failed`. A requester
that reads a `delivered` written by any other process must still check the target's own reaction: the exchange is not authenticated.

**Coordination tokens another tool may write:** `typing-<tool>` = its epoch ms while it types into the pane (tab-recap waits for an
earlier one); `awaiting` or `awaiting-<tool>` = what the pane waits for (autocompact counts the lane as in flight, and says why); and
`note` or `note-<tool>` = a line shown under the lane's header, labelled with the tool's name.

**Events** are the same token, `tab-recap-event`, on the lane's pane; the daemon's start and stop are the workspace's, on every
workspace. Kinds: `recap-written` (the trigger), `needs-raised` and `needs-cleared` (the count), `compact-queued`, `compact-running`,
`compact-done` and `compact-failed` (the compaction's id, and the reason when failed), `autocompact-decided` (the verdict and the share,
e.g. `compact-24`), `autocompact-skipped` (the gate, written only when it changes), `lane-closed`, and `daemon-started` and
`daemon-stopping` (the version). `<seq>` is a whole number in base 36, starts at the daemon's start and rises by one per pane or
workspace: a gap is a missed event, and the state tokens are always the current truth. A workspace created after the daemon started hears
the daemon's start only at its next start or stop.

**One writer per name.** A token name is written by one tool only, and the writer's name is part of it. herdr keeps one flat map per
pane, merged from every source, so the last write of a name wins and a `null` removes it whoever wrote it. Never write a name that is
not yours.

**The lease.** Before typing into a pane, write `typing-<tool>` = epoch ms with a time to live of a minute, then read the pane's
tokens. An earlier live lease of another tool (or the same stamp with a smaller name) comes first: clear yours and wait. Clear yours
when you have finished typing. A lease a crashed writer left expires by itself. The lease is held around the send only, not while the agent answers.

**The lease is not a lock.** Its stamp is taken before the write, so a tool whose earlier stamp lands after tab-recap has read the pane can
still overlap it. When herdr cannot take or read tokens (no such method, or unreachable), typing goes on without a lease, and the log says so once
per outage.

**The version.** `tab-recap-api` is the protocol version. A breaking change to a token's name or value format raises it.

**The token protocol.** Each exchange another tool can start is declared once in `src/protocol/`, and its golden vectors are in
`protocol/vectors/`. A request is the token `<prefix><tool>` (`compact-req-<tool>` for `compact`). Its answer is one token per pane,
shared by every requester of that exchange: `tab-recap-<exchange>` = `<id>:<stage>` (`tab-recap-compact` for `compact`). The stages are
`queued`, `running`, `done` and `failed-<reason>`; a restart that interrupts an ask writes `failed-interrupted`. A requester reads an
answer whose id is not its own as foreign and keeps waiting for its own id. A stage the exchange does not declare reads as unreadable, and
a `failed-` stage a tool does not know should be read as a failure. The id grammar belongs to the exchange: `compact` keeps the legacy one
(1 to 16 characters, anything but `:`), and an exchange added later takes `token-safe` (`[A-Za-z0-9_-]`, 1 to 16 characters).

**The capability token.** `tab-recap-x` = `compact1,kinds2` on a lane's pane when sharing is on: `<exchange><version>` for every exchange
tab-recap answers and has enabled, then `kinds<version>`, the version of the agent kinds list in `protocol/vectors/kinds.json`. An exchange
missing from the list is not offered, so do not wait for it. A pane without `tab-recap-x` offers nothing: sharing is off, or the tab-recap
predates this token.

**Not authenticated.** The protocol does not authenticate its writers. Any process of the same user with access to herdr can write or clear
any token, a request, an answer or the capability token. An answer is an observation of what the answer token holds, not proof that the work
was done.

**Carrying a copy.** A tool may carry a verbatim copy of `src/protocol/` and `protocol/vectors/`. `test/protocol-vectors.test.ts` runs the
vectors against `src/protocol` and imports nothing but `node:` modules and that folder, so it can be copied with them. `protocol/MANIFEST`
lists each of those files with its SHA-256 in `sha256sum` format, the paths relative to this directory. To check a copy, lay it out the same
way and run `sha256sum -c protocol/MANIFEST` where `src/` and `protocol/` sit, against the MANIFEST of the tag the copy pins.

**Measured herdr facts.** herdr writes a token only when its value changes: a rewrite with the same bytes emits no event, so tab-recap reads a
pane's request tokens on every read of its token map, not only on an event. A token whose time to live runs out emits an event with a null
value. herdr truncates a value over 80 characters, so the protocol refuses to write one; only the compact answer is cut to 80, as before the
protocol. Token names are `[A-Za-z0-9_-]`, 1 to 32 characters.


## Configuration reference

Key new with herdr events: `TAB_RECAP_HERDR_EVENTS` (`off` by default, or `on`: lanes are shared on herdr's event stream as pane tokens, and another tool's `compact-req-<tool>` request is answered in `tab-recap-compact`; see the setting "Herdr events"). Off writes no token and answers no request; the typing leases and `awaiting` tokens of other tools are honoured either way. `TAB_RECAP_HANDOFF_REQUESTS` (`off` by default, or `on`, effective only with herdr events on) lets another tool ask for a handoff of its lane, answered in `tab-recap-handoff` (see "For other tools").

Keys new in 2.1: `TAB_RECAP_PIPELINE` (`one` by default, `enumerate`, `enumerate+gates` or `full`: the steps a run's new turns go through) and `TAB_RECAP_RECONCILE_EVERY` (turns between two reconciliations of the ledger by the curator, default 8).

Keys new in 2.0: `TAB_RECAP_JUDGE_BY` / `_MODEL` / `_EFFORT` and `TAB_RECAP_CURATE_BY` / `_MODEL` / `_EFFORT` (the two new jobs, see [Models](#models)); `TAB_RECAP_KEEP_INPUT_DAYS` (days the input of each run is kept for the judge, default 14, `0` = never); `TAB_RECAP_KEEP_DAYS` (days before a closed tab is removed, default 30, `0` = never); `TAB_RECAP_CLOSED_LANE_DAYS` (days a closed lane's record is kept for `--from-closed`, default 14, `0` = record nothing).

### Recap runs

`TAB_RECAP_RUN_DEBOUNCE_MS` sets the run window, the minimum gap between turn-ended runs of one tab, measured from
the start of the last run that called the writer. Endings inside the window are collected into one run, which reads
their turns through the transcript cursor. The settle delay still applies after each ending. Focus, requested refreshes,
and, when a window is enabled, the first run of a tab in this process and a changed lane set are forced runs and start at once. The default is `0`
(off), which keeps the previous timing. Set `5000` through `300000` to use a window; invalid values act as `0`.

Use `tab-recap eval --replay <file> --merge-turns <n>` to group consecutive turns into one writer call and compare its
result with the existing `--merge-turns 1` report. The replay report names the merge count beside the pipeline.


## State and rolling back

The plugin keeps what it knows in one SQLite file, `tab-recap.db`, in its state directory (the path `tab-recap.status` prints;
it must be on a local disk — WAL does not work on network filesystems). Process files stay files: `daemon.pid`, `daemon.beat`,
`daemon.version`, `daemon.log`, `disabled` and `summarizer/`.

**From 1.6.0 on** the first daemon that starts moves the old JSON files (`recaps/`, `tabs/`, `requests/`, `visibility/`,
`hidden.json`) into the database in one transaction, checks every tab reads back identically, and only then moves the files to
`legacy-files-<timestamp>/` in the state directory. They are never deleted. Before you upgrade you can see what would happen,
touching nothing: `cp -r <state dir> /tmp/state-copy && bun src/adapters/db/import/dry-run.ts /tmp/state-copy`.

**Back to 1.5.1:** `tab-recap.stop` (stop the daemon), move the contents of `legacy-files-<timestamp>/` back into the state
directory, check out 1.5.1, start it. The 1.5.1 daemon ignores `tab-recap.db`; recaps written since the upgrade are not carried
back. Upgrading to 1.6.0 again later starts from the database as it was: delete `tab-recap.db*` first to import the files again.

Schema versions so far: **1** (1.6.0, the import), **2** (1.7.0, each lane's web address for links),
**3** (1.8.0, standing rules, compaction requests and context use), **4** (2.0, compaction records), **5** (2.0, each run's input, the gates' counts and the verdicts of `tab-recap eval`), **6** (2.0, the ledger of facts and the import of 1.x items), **7** (2.0, the curator's paragraph), **8** (2.0, boundaries keep their tokens; a compaction record points at its boundary), **9** (2.1, a fact keeps its anchor).
An upgrade of the database itself first copies it to `tab-recap.db.v<n>.bak` (the newest three are kept). If a database was
written by a **newer** plugin than the one running, it is opened read-only and left alone: the daemon shows a notification and
stops, the columns say so instead of a recap — upgrade the plugin, or restore the backup the message names.


## Develop

See [`CLAUDE.md`](../CLAUDE.md) (layers and red lines) and [`CONTEXT.md`](../CONTEXT.md) (vocabulary).

The code carries no comments. The lint gate fails on any comment that is not a directive pragma (`recap-no-comments`): names, types and tests carry the meaning, and the rationale lives in [`CONTEXT.md`](../CONTEXT.md) or the OpenSpec design of the change that made the decision.
