# Design: a second host for the engine, a plain Claude Code session

## Context

| Fact | Where |
| --- | --- |
| The facade returns facts, never text; an engine file imports only engine files | `tab-recap/src/recap/application/engine.ts`, `ci/engine-files.json`, rule `engine-self-contained` |
| The handoff text is built from one task's open and recently closed facts, sanitised and vetted, grouped and capped, then fitted to 16 KiB | `application/handoff-content.ts`, `render/handoff-markdown.ts`, `render/handoff-budget.ts`, `application/handoff-limits.ts` |
| The handoff's live source resolves the task through `readRecap(tab).tasks` (a task whose `lanes` list the pane), not through tab views | `application/handoff-source.ts` |
| `--print` goes through tab views and refuses a source equal to the target | `application/handoff-print.ts` |
| The handoff payload is English whatever the UI language | `openspec/specs/tab-recap/lane-handoff/spec.md` |
| A followed session is still herdr's `Lane`, keyed by its pane | `engine-boundary` design, Risks |

## Decisions

### D1. The engine returns the restore facts; the text is a render a host calls

`Engine` gains `restore(scope, session): RestoreFacts` (`at`, `lastRun`, `open`, `closed`). It resolves the tasks of the scope
whose `lanes` list the session's pane, as the handoff's live source does, and reads `Ledger.openOf` and `Ledger.recentlyClosed`
over the window `CLOSED_SHOWN_MS` through `taskFactsOf`, with the engine's own clock. The facade keeps its rule (facts, not text)
and its closure: `ledger-input.ts`, `ports/recap-records.ts` and `domain/fact.ts` are already listed, so `ci/engine-files.json`
does not change. When several tasks list the session the facts of all of them are returned: the handoff refuses that case
(`task-ambiguous`) because it must pick one task for another agent, while a restore is for the agent that did all of it.

The text is built outside the engine: `application/restore-text.ts` (`restoreContentOf`, `restoreTextOf`) and
`render/restore-markdown.ts` (`fitRestore`). No engine file imports render, and a host imports the text
function beside the facade.

### D2. One grouping and one fitting for both texts

The handoff's candidate, vetting, grouping and capping move unchanged to `application/handoff-groups.ts` (`groupedFactsOf`), and
`fitHandoff` becomes `fitGroups` over a serializer; `buildHandoffContent` and `fitHandoff` call them. The handoff tests pass
unchanged, so its bytes are the same. The new files carry no domain-types finding, and the entry of `handoff-content.ts` in
`ci/domain-types-baseline/B3.json` is lowered by what moved out of it. The restore text uses the same groups, headings, entry lines, caps, drop order (oldest of
now and next first, then of done, links and closed) and the 16 KiB budget of `handoff-limits.ts`. It has no reference line,
note, freshness block or worksite: one opening sentence gives the time of the last good run, and a closing line counts what was
left out.

### D3. Addressed to the same agent, in English

The opening is first person ("These are my notes on where my work stood, last brought up to date at …"), and nothing in the
template names a plugin word (`domain/forbidden-words.ts`), a tool, a ledger, a handoff or another agent; a test asserts it over
every group and the left-out line, and the probe is shown to bite the handoff's preamble. The frame is English, as the handoff
payload is; the facts keep the language they were written in. An empty ledger, a scope with no run, or facts that are all
withheld give `''`, and the host prints nothing.

### D4. The host, first version

Owner defaults, stated in the host's README so they can be changed:

| Question | Default |
| --- | --- |
| Process model | one short-lived process per hook; `Stop` (async) starts a detached runner that takes a per-session lock (a stale lock of a dead pid is stolen), waits the settle time (2.5 s, injectable), calls `engine.refresh`, and reruns once if another `Stop` arrived meanwhile; no daemon |
| Identity | one session = one scope with one followed session, from the hook's `session_id`; records from its `transcript_path`; the followed session's pane is the session id (debt: `engine-boundary` Risks) |
| Storage | its own SQLite file under `${XDG_STATE_HOME:-~/.local/state}/session-ledger/claude-code/`, path injectable; never the herdr plugin's store |
| Double recaps | the launcher exits 0 silently inside herdr (`HERDR_ENV=1`) and in the engine's own writer runs (a marker the host sets on the writer's environment); herdr wins when both could follow a session |
| Headless runs | not followed unless `SESSION_LEDGER_HEADLESS=on`, since each followed turn costs a writer run |
| Forks | a fork does not inherit its parent's ledger |
| PreCompact | off unless `SESSION_LEDGER_PRECOMPACT=on` |

## Risks

- The restore text frames the writer's facts as the agent's own notes. They were written by the writer from the transcript, not
  by the agent; the opening says they can lag and must be checked against the worktree, as the handoff's preamble does.
- `lastRun` is the scope's, not the session's. With one session per scope (D4) they are the same; a host that follows several
  sessions in one scope would date the restore by the newest run of any of them.
- A `/clear` starts a new session id, so with the session id as the pane the restore of the new session is empty (`engine-boundary`
  Risks); that is the intended reading of "a fork does not inherit" until the facade takes a host-chosen stable key.

## Hand-written pieces kept

The restore render is a few lines of template over the handoff's own group lines and fitting; no built-in renders markdown
groups under a byte budget, and reusing the handoff's code is the alternative to a second copy.
