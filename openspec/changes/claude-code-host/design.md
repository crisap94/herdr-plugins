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

### D5. The host's core: built beside tab-recap, checked by its own commands

`claude-code/` is TypeScript on Bun importing tab-recap's source by relative path (`../tab-recap/src/...`). tab-recap's `#src/*`
imports and its bare imports resolve per importing file, from `tab-recap/package.json` and `tab-recap/node_modules`, so the host
needs no build step and no dependency of its own; a bare import written in a host file does not resolve, so the harness runtime
is a plug its caller passes in. Its `tsconfig.json` repeats tab-recap's strict flags and borrows tab-recap's `@types` and
ambient declarations; `bun run typecheck` runs tab-recap's `tsgo` over it, `bun run test` its tests, and `bun run rules`
(`ci/rules.sh`) the tab-recap ast-grep rules that apply outside the plugin (no comments, vocabulary, no suppression, read-only
foreign SQLite, write transactions, no Drizzle transaction, never types), each checked to bite its bad probe from there.
tab-recap's `ci/lint.sh` and `ci/test.sh` scan only `tab-recap/`, and the repository's CI runs only there: oxlint, the
domain-types ratchet, the module graph, the lane map and the engine manifest do not cover this folder (listed in its README).

The core has four files: `payload.ts` (a hook payload to a host event or a typed refusal), `compose.ts` (the plugs: tab-recap's
SQLite store opened and migrated at `<state>/ledger.db`, the Claude transcript reader rooted at the grandparent of
`transcript_path`, `RecapWriter` over the claude `LibraryHarness` with every run's environment carrying
`SESSION_LEDGER_WRITER=1`, the real git repo lookup the daemon uses, the clock, the language read like tab-recap's),
`lock.ts` (a per-session lock file created exclusively, stolen from a dead or overlong holder, and a dirty marker) and
`runner.ts` (lock or mark dirty, settle, `engine.refresh`, rerun while dirty up to 3 rounds, release, errors to a log file).
The writer is built directly rather than through `daemon/backends.ts` `summarizerFor`, which needs the herdr plugin's whole
`Config` read from herdr's config folder. The payload carries no field that tells a headless run; the launcher step is to follow
a session only when `CLAUDE_CODE_ENTRYPOINT` is `cli` or `SESSION_LEDGER_HEADLESS=on`, the safest reading while that variable is
unproven by a live capture.

### D6. The plugin packaging and the commands

Checked against the Claude Code plugin and hooks reference before writing:

- The manifest is `.claude-plugin/plugin.json`; only `name` is required. `claude-code` and any name starting `claude-` are
  reserved, so the plugin is named `session-ledger`.
- `hooks/hooks.json` wraps the event map in a top-level `hooks` key. Every handler is `sh "${CLAUDE_PLUGIN_ROOT}/scripts/hook" <event>`.
  `SessionStart` takes only `command` (and `mcp_tool`) handlers; it is matched to `compact|resume` with a 10 s timeout. `Stop` and
  `PostCompact` are `async: true`. An async hook's printed JSON would reach the model on the next turn, so both print nothing.
  `PreCompact` is synchronous with a 10 s timeout; its stdout becomes the compaction's instructions.
- A `SessionStart` hook adds context by printing `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":...}}`.
  Plain stdout would work too. Any context string over 10,000 characters is saved to a file and replaced by a 2,000-character
  preview. So the host fits the restore to 9,000 bytes (`restoreContentOf` and `fitRestore`, C1's pieces), not the handoff's
  16 KiB.
- A plugin's `bin/` folder is put on the Bash tool's `PATH`, so the model could run anything there. The launcher and the
  human's command live in `scripts/`, and `bin/` does not exist (a test holds this).
- In a `-p` run, Claude Code kills async hooks still running at teardown. The runner is therefore started detached
  (its own process group, stdio to the log), and `main.ts` returns at once.
- A headless run cannot be told reliably. No hook payload field names the run mode. `CLAUDE_CODE_ENTRYPOINT` is not in
  the documented environment variables. `CLAUDECODE` and `CLAUDE_CODE_CHILD_SESSION` are set for interactive and print runs
  alike. The launcher follows a session only when `CLAUDE_CODE_ENTRYPOINT` is exactly `cli` or `SESSION_LEDGER_HEADLESS=on`.
  An absent or other value costs nothing.

`scripts/hook` (POSIX sh) exits 0 silently, before starting bun, in each of these cases: inside herdr, in a writer run, for a
run that is not known to be interactive, for `PreCompact` unless it is on, and when bun is missing. Otherwise it runs
`bun src/main.ts <event>` with stderr appended to the log, and exits 0 whatever bun does. `main.ts` reads the payload and
answers in `hook.ts`:

- `Stop` and `PostCompact` start `src/run.ts` detached, which notes the session in `<state>/sessions/` and runs the C2 runner
  with the real writer. `PostCompact` calls `refresh`, the same call as `compacted`.
- `SessionStart` `compact` or `resume` prints the context JSON from a read-only open of the ledger, or nothing.
- `PreCompact`, when on, prints `guidanceOf` over `sectionsOfOpen(restore.open)`, cleaned by the brief's forbidden-word
  filter. That is tab-recap's compaction template path, with no model call.

The real harness runtime comes from a relative import of `tab-recap/node_modules/@stateforge-labs/harness-adapters/dist/src/runtime`,
the same file tab-recap's bare import resolves to.

`scripts/session-ledger show [--session <id>]` and `line` are for the human. They open the ledger read-only
(`connectReadOnly`) and find a session in the sessions index by folder or id.

## Risks

- The restore text frames the writer's facts as the agent's own notes. They were written by the writer from the transcript, not
  by the agent; the opening says they can lag and must be checked against the worktree, as the handoff's preamble does.
- `lastRun` is the scope's, not the session's. With one session per scope (D4) they are the same; a host that follows several
  sessions in one scope would date the restore by the newest run of any of them.
- Two host processes write one SQLite file. WAL, `BEGIN IMMEDIATE` and a 2 s busy timeout make short writes safe (a test races
  two processes on a fresh ledger); a write held longer than 2 s fails the other with `SQLITE_BUSY`, which is logged and caught
  up by the next `Stop`.
- The lock's steal leaves a narrow window in which a fresh lock can be replaced; the cost is one extra writer run. A reused pid
  looks alive until the 20-minute longest hold.
- `ClaudeTranscripts` finds `<root>/*/<session>.jsonl`, the newest by mtime: a `transcript_path` not named after the session is
  not found, and a same-named file in another project folder can win.
- A `/clear` starts a new session id, so with the session id as the pane the restore of the new session is empty (`engine-boundary`
  Risks); that is the intended reading of "a fork does not inherit" until the facade takes a host-chosen stable key.

- The headless reading rests on `CLAUDE_CODE_ENTRYPOINT`, which is undocumented. If interactive hooks do not see `cli`, nothing
  is followed until `SESSION_LEDGER_HEADLESS=on`, which also follows print runs. Only a live capture settles it.
- On `resume` the restore is keyed by the payload's `session_id`. If a resumed session gets a new id, the restore is empty, as for
  `/clear`.
- The runner script is a setting (`SESSION_LEDGER_RUNNER`), so tests can start a fake one. Anyone who can set the hook's
  environment can already run code in it.
- The sessions index is written by the runner before it refreshes. `show` finds a session only after its first `Stop`, and only
  in the exact folder the session started in.

## Hand-written pieces kept

The restore render is a few lines of template over the handoff's own group lines and fitting; no built-in renders markdown
groups under a byte budget, and reusing the handoff's code is the alternative to a second copy.
