# Design

## 1. The codemod works on the parser's trivia, not on text

A regular expression cannot tell a comment from a `//` inside a string, a template or a regex literal. The codemod
(a one-off script, kept outside the repository) builds each file with the TypeScript compiler API, at every token
boundary asks `getLeadingCommentRanges` and `getTrailingCommentRanges`, and so finds each comment the parser sees as
trivia. A removed comment takes its own line when it stands alone, and only its own spacing when it shares a line
with code. Released migrations are left out of the removal: `ci/check-migrations.sh` keeps them byte-identical, so the rule lists them under `ignores` instead.
Two checks gate the result before anything is written: the leaf tokens of the parse tree, JSDoc excluded,
are identical before and after (the removal changes trivia only), and the result has no comment left except the
kept pragmas.

Why no Node built-in fits: Node strips types but does not expose its trivia, and `node --test` is the plugin's test
runner, not a formatter. The codemod is a development tool, not plugin code: it runs from a scratch directory with
the `typescript` package installed there, and the repository gains no dependency (the plugin keeps zero runtime
dependencies, and `tab-recap/package.json` does not change).

## 2. The removal list is kept for triage

Every removed comment is written to a file with its path, its original line and its text, before the relocation
step. Triage works from that file, so each comment has exactly one recorded destination and none is lost. The file
is an input to this merge request, not an artifact of it.

## 3. Five destinations, one per comment

| Destination | Takes | Example |
| --- | --- | --- |
| dropped (restates the code) | what the name, type or signature already says | a JSDoc line that repeats a function's name in prose |
| pinned by a test | a constraint or number that an existing test already fails on when broken | a range that a test asserts at both ends |
| `CONTEXT.md` | a domain term or a vocabulary rule | what a lane is, what a break is |
| `README.md` | an operator-facing default, limit or measured herdr behaviour | a default cooldown, the herdr event ordering |
| this `design.md`, section 5 | a design rationale that no name, type or test carries | why a number was chosen, which order a caller must keep |

Rationale is never moved into code as prose again. Where a fact is a closed set or a unit, the triage notes name the
type that would carry it; those are candidates for a later change because encoding them changes signatures.

## 4. The guard is an ast-grep rule like the others

`recap-no-comments` uses the same shape as the existing red lines: a `kind: comment` node, a `not` that excludes the
directive pragmas by regular expression, a `bad` probe that must trigger it and a `good` probe that must not. The
rule's `files` list covers `src`, `bin`, `test` and its own probes, so `ci/lint.sh` scans it with the other rules and
the bite check in `lint.sh` proves it. The shebang line is not a comment node in the grammar, so it needs no
exclusion; the probes prove that too.

## 5. Rationale relocated from comments

Every item names the source file and line it came from, before the removal, so a reviewer can compare the original comment with what now stands here. Headings group the items by owning topic. Each item is one fact that no name, type or test states; the comments that restated the code, and those already pinned by a test, are not repeated here.

### Store: connection, upgrade and reads
- Every write is `writeTx`: `BEGIN IMMEDIATE` takes the write lock up front, because a deferred transaction that upgrades can fail at once with `SQLITE_BUSY`; a throw rolls everything back, and inside a transaction already open (the import wraps many writes) it joins it. (src/adapters/db/connection.ts:22)
- `enableDefensive` is on by default and must never be switched off. (src/adapters/db/connection.ts:10)
- `auto_vacuum` only takes effect before the first table exists and WAL mode is stored in the file, so both are set once, when the file is created, outside any transaction. (src/adapters/db/open.ts:23)
- The pre-upgrade backup is `VACUUM INTO`, which is synchronous and takes a consistent snapshot of a WAL database; it is written aside and renamed so a half copy never has the final name, and a copy of that version that already exists (another process made it) is reused. (src/adapters/db/backup.ts:19)
- `PRAGMA foreign_keys` does nothing inside a transaction, so an upgrade switches it off first (a table rebuild needs that), applies every pending migration in one `BEGIN IMMEDIATE`, and refuses to commit while `foreign_key_check` finds a broken key. (src/adapters/db/migrate.ts:36, src/adapters/db/schema/migration.ts:3)
- A repository read never throws into the render loop: a bad row or a locked or damaged file answers empty (or the fallback), so a column still draws; a write is one transaction. (src/adapters/db/ledger.ts:1, src/adapters/db/rows.ts:49, src/adapters/db/compaction-records.ts:1, src/adapters/db/autocompact-records.ts:1)
- A fact closed more than 24 hours ago is not loaded to be folded, so an operation that names it reads as an unknown id. (src/adapters/db/ledger-rows.ts:14)
- Money is stored as whole millionths of a dollar; a branded `Micros` type would carry the unit. (src/adapters/db/run-write.ts:11)
- Ids made by different repositories stay in order because the process has one generator. (src/adapters/db/uuid7.ts:78)
- An unreadable store answers "seen" to the question whether another tool's ask was acted on: nothing is acted on that cannot be recorded. (src/adapters/db/ask-records.ts:22)
- Queued requests from other tools that the daemon will not run are taken away and each is answered, so a requester is not left waiting. (src/adapters/db/requests.ts:79)
- Migration 10 turned every stored `manual` boundary trigger into `plugin`: under the old rule each of them had been plugin-driven. (src/adapters/db/schema/010-autocompact.ts:17)
- Migration 13 keeps `compact_ask` as its own table because the request row is deleted when it is taken and carries no tool name, so it cannot remember (tool, id) across restarts. (src/adapters/db/schema/013-herdr-asks.ts:3)
- The import dry run (`src/adapters/db/import/dry-run.ts <state-dir>`) imports a state directory into a throw-away in-memory database and reports what came out; it touches nothing on disk, and is run against a copy of the live state first. (src/adapters/db/import/dry-run.ts:1-2)

### Harnesses and transcripts
- The claude harness runs on the operator's subscription, so `--bare` (which needs an API key) is not used; it gets no tools, no settings (so no hooks), no MCP and keeps no transcript. (src/adapters/claude-harness.ts:34)
- The codex features a recap never uses are disabled, each probe-verified on codex 0.157.1 (an unknown one is an error); together they cut the request by about 6 %. `apps`, `image_generation`, `sleep_tool` and `goals` are accepted too but make the request about 2.5x bigger, so they stay on. (src/adapters/codex-harness.ts:11)
- hermes runs with `--safe-mode` (drops user config, rules, memory, plugins and MCP) and `-t clarify`, the one toolset that cannot touch files, a shell or the network; measured: `-t ''` means all tools. (src/adapters/hermes-harness.ts:13)
- opencode runs with every tool and permission denied; measured, the request shrinks from about 9k to under 1k tokens and no tool event appears. (src/adapters/opencode-harness.ts:12)
- The Claude project slug is never derived from the cwd, because a session moves with `/cd`. (src/adapters/claude-transcripts.ts:30)
- herdr reports no session id for a codex lane, so its transcript is the newest rollout started in the lane's cwd (a heuristic). (src/adapters/codex-transcripts.ts:69)
- glow pads every line to the full width with spaces inside trailing colour codes, so the padding is dropped and the codes kept; it prints plain text when its output is captured, so an explicit style is required. (src/adapters/glow.ts:6, src/adapters/glow.ts:2)

### herdr behaviour
- Measured on codex: an Enter sent 0 ms after the typed text is swallowed by the slash-command popup, 250 ms later it runs the command. (src/adapters/herdr-agents.ts:17)
- A pane token is not typing, so an agent's pane may carry one (`pane.report_metadata`; a null value removes a name); the red line `recap-never-types` is about keys and text. (src/adapters/herdr-fleet.ts:178)
- A herdr modal is a session-level popup: it has no pane id and is gone when its process exits. (src/adapters/herdr-fleet.ts:33)

### Commands
- `eval` reads the operator's lines with its own reader that returns null once the input has ended, because readline's `question` would wait forever then. (bin/eval.ts:16)

### EXP-002 tooling
- Pipeline: `autocompact-corpus` samples 240 stored turn ends from a copy of the store (`node bin/autocompact-corpus.ts --db <copy of the store> --out <dir>`), rebuilds each one's state and hindsight and measures what followed every compaction; `autocompact-briefs` regenerates the compaction brief of 30 points (the high-share stratum with at least five facts to check, drawn with the seed) with the plugin's own brief job; `autocompact-label` has the labeller answer the six questions per point with the hindsight in view (`--dir <dir> [--briefs] [--crosscheck] [--kappa] [--limit n] [--operator n]`, the deterministic cross-check of `needs_verbatim` runs beside it, `--briefs` labels regenerated briefs against their facts); `--operator n` shows n points one at a time and reads one line per point from stdin, six 0/1 digits in the order printed, `s` skips, `q` quits, answers going to `operator-labels.jsonl`; `autocompact-probe` has one arm answer the six questions on every point and the coverage questions on every brief fact (`--dir <dir> --arm jev|haiku-low|haiku-medium|luna-low --rep 1|2`, answers in `answers-<arm>-<rep>.jsonl`, resumable); `autocompact-report --dir <dir>` prints numbers only as Markdown and writes `<dir>/report.md`, per arm and question, per policy, on the outcome set and for coverage, then the pre-registered rule. (bin/autocompact-corpus.ts:1-2, bin/autocompact-briefs.ts:1, bin/autocompact-briefs.ts:22, bin/autocompact-label.ts:1-3, bin/autocompact-operator.ts:1-2, bin/autocompact-probe.ts:1-2, bin/autocompact-report.ts:1-2)
- Raw experiment output quotes real sessions, so the output directory is never inside the repository. (bin/autocompact-corpus.ts:2)
- Each arm makes one decider per lane (a lane is one concurrent call); Codex needs its own work folder, and the labeller is Codex through the plugin's own harness with one slot per concurrent call. (src/adapters/experiment-arms.ts:1, src/adapters/experiment-labeller.ts:1)
- A point is a stored turn end of a lane, rebuilt from the transcript bytes before its cursor and the ledger at its time. (src/adapters/experiment-point.ts:1)
- EXP-002 was measured with a minimum of 40, the default then; the replay keeps 40 although the default is now 10. (src/adapters/experiment-point.ts:20)

### Spawned programs

- A program spawned for a writer, judge or git call gets the environment with every `HERDR_*`, `TAB_RECAP_*`, `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` variable removed: herdr's Claude hook registers any `claude` that starts with `HERDR_PANE_ID` set as the agent of that pane, so a summarizer run would appear as a lane. No test pins the scrub (`scrubbedEnv`). (src/adapters/process.ts:19)
- A harness that takes its prompt as an argument gets the document capped at 120 000 bytes (`ARGV_BYTES`): more risks `E2BIG` and a very long process command line. (src/adapters/recap-prompt.ts:26)

### Popups from the column and the modal

- `s` (settings) and `c` (compact) from the modal: the modal is itself a popup, so it closes first and a short-lived command opens the next popup; from a column the command runs at once, since it asks herdr for the popup itself. (src/column/main.ts:178; src/column/main.ts:165)

### Column drawing

- The column asks the terminal for its size on every draw: herdr resizes it right after opening, and the SIGWINCH that would refresh `process.stdout.columns` does not always arrive. (src/column/main.ts:111)
- A row is drawn with one cell of padding on each side: writing into the last cell of a row makes `ESC[K` erase it. (src/column/main.ts:28)

### Jobs and backends

- The enumeration runs on the recap writer's harness and model at low effort: it lists candidates and the writer decides. There is none when no harness is present or the writer is a `custom` command, whose contract is the single call. (src/daemon/backends.ts:48)

### Daemon loop

- Each intent is bounded (`INTENT_MS`) so one stuck intent cannot stop the daemon from folding the next observation, and the loop yields to the event loop between intents so sockets and timers keep being served during a long run of cheap ones. (src/daemon/main.ts:147-148)

### Shutdown

- On stop the daemon stops folding first (so a column that goes away is not reopened), then closes every column in one batch and waits for it. Exiting first used to leave most columns open, and the next daemon adopted columns still running the old code; a close that does its own look at herdr (the agent guard) is too slow to repeat 27 times in a second (`closeEvery`). (src/daemon/shutdown.ts:8; src/ports/columns.ts:30)

### Experiment sampling

- The sample takes its strata in the order boundary, high, random, each from what the earlier ones left: the turn ends before a compaction are mostly above the minimum, so they go first or the high stratum would use them up. A short stratum gives all it has. (src/experiment/stratify.ts:26)

### Git note

- The git note trusts an answer for a TTL when neither HEAD nor the index moved, because an edit to a tracked file moves neither: the TTL is what notices such edits. (src/extensions/git-note.ts:21)

### Launchers

- On an unsupported host a pane (column, settings, compaction) shows the refusal and stays: a pane that closes is reopened, and the text would flash by. (That it stays until SIGTERM is pinned in launchers.test.ts.) (src/host/launch.mjs:16)

### Host

- The minimum Node (`MIN_NODE`) is what lets the plugin run its TypeScript directly and keep its state in `node:sqlite` without an experimental warning, so no launch needs a flag (`node:sqlite` is warning-free from 24.15; the number is pinned in host-policy.test.ts). (src/host/policy.mjs:4)

### Ports

- `AskRecords.seen` answers true when the store cannot tell, so an id is then not acted on (fail closed). (src/ports/ask-records.ts:3)

### Compaction records

- At daemon start, list the requests from other tools whose compaction is unfinished before calling `interrupted`: the restart answers each of them, then marks what was in progress `unconfirmed`. (src/ports/compaction-records.ts:85)

### Harnesses

- A harness's `limit` is the most bytes of instructions plus input it can take as a command-line argument (not through stdin); `null` means no limit, and a caller over it refuses with an `Unknown` instead of truncating. (src/ports/harness.ts:27)

### Autocompact: busy and in-flight windows

- A compaction that was asked for and has not begun counts as in progress for five minutes (`ASKED_FOR_MS`): the window has to outlast the worst gap between asking and the compaction record appearing (the recap wait plus the queue poll), or a second lane could be requested in between. (src/recap/application/autocompact-gates.ts:10)

### Compaction: one per lane

- Claiming a pane and checking whether it is claimed are one synchronous step, taken after the last `await` before the flow starts. JavaScript runs that step without interleaving, so two requests for one lane cannot both pass the check: the loser joins the running compaction. Moving an `await` between the check and the claim would break this. (src/recap/application/compaction-claims.ts:2)
- After herdr pushes `done` the agent may still be flushing its records file, so the outcome reads the records again, three more times, 300 ms apart, while they say nothing. (src/recap/application/compaction-outcome.ts:11)

### Comparison with 1.x

- A 1.x recap is compared with the replay only when it was written within 30 minutes after the replay's last run; later than that it describes work the replay never saw. (src/recap/application/compare-imported.ts:15)
- One comparison call is given at most 250 000 characters of evidence; when there is more, the oldest documents are dropped first, so the newest turns of the chapter are always judged. (src/recap/application/compare-imported.ts:17)

### Reading herdr's stream
- A phone attaching to a tab narrows it, and herdr announces that only as a `layout_updated` event. The decoder maps it, with the other structural events, to "re-read the snapshot" — this is how a narrower tab is noticed. (src/recap/application/decode.ts:80)

### The phone bar
- A bar pane is 3 rows tall: its one row of text plus two rows of herdr's pane border. Type-candidate: name the two parts (`BAR_TEXT_ROWS`, `PANE_BORDER_ROWS`). (src/recap/application/dispatch.ts:71)

### Dispatch
- The autocompact notification that follows a lane going idle or done is told without being awaited. Autocompact handles its own errors, so dispatch neither waits for it nor catches from it. (src/recap/application/dispatch.ts:26)

### Per-pane caches
- The caches kept per pane (a lane's context use, its web context, its live prompt) are bounded and drop their oldest entries past a fixed count. herdr never announces a pane that is gone, so nothing else would ever remove its entry. The live-prompt table's bound is pinned by `test/live-prompts.test.ts:67`; the other two share the rule. (src/recap/application/lane-contexts.ts:11, src/recap/application/lane-webs.ts:5, src/recap/application/live-prompts.ts:8)

### Recap runs
- A tab has one recap run at a time. A request that arrives while a run is going is held as the single one queued behind it, and a newer request replaces the held one (the newest lanes and cause win); it runs when the first ends. (src/recap/application/recap-job.ts:79)
- A run caused by a turn ending starts 2.5 s after the request, and a newer request restarts that wait. An agent's status can flap between `working` and `idle` around a turn's end, and transcripts are read once it settles. (src/recap/application/recap-job.ts:50)

### Gates
- A duplicate (G2) is refused as a repeat of an earlier item, so the order in which a task's items are judged decides which of two repeating items stays: the goal first, then `now`, `needs`, `done`, `decisions`, `next`, `links`, `rules`. (src/recap/application/gatekeeper.ts:23)

### Transcript readers

- Reading the newest turns of a task's lanes (the tail) moves no position: the recap's cursors are the recap job's alone. (src/recap/application/transcript-tail.ts:1)

### Herdr subscriptions

- Of herdr's 27 subscribable event types only 3 are per-pane; `pane.agent_status_changed` is the one that ends a turn, so each lane gets its own subscription and the global topics tell the daemon when the set itself must change. (src/recap/application/watch-set.ts:4)

### Recap input

- A turn is clipped to its beginning and its end, never its middle, because an answer's conclusion is at the end. (src/recap/application/writer-clip.ts:1)
- `xml.ts` is the one serializer of the writer's document and follows XML 1.0: `Char` (§2.2), character data (§2.4), CDATA sections (§2.7) and attribute-value normalisation (§3.3.3), so the output is well-formed whatever a transcript holds. (src/recap/application/xml.ts:1)

### Boundaries and chapters

- A new chapter starts at the boundary's time but never before the chapter it seals (a record can be older than the tab's first sight). (src/recap/domain/boundary.ts:57)

### Herdr tokens

- An answer in `tab-recap-compact` is kept an hour: progress is also an event, so a late reader only needs the last word. (src/recap/domain/compact-request.ts:9)
- An event's `<seq>` starts at the daemon's start time in base 36 and rises by one per pane (or workspace), so a restart never reuses a number and a subscriber that sees a gap knows it missed an event. (src/recap/domain/event-token.ts:2)

### Gates

- G6 (unknown id) belongs to the ledger gates and G7 (length) is the clip in `application/recap-shape.ts`, so neither is in this list. (src/recap/domain/gates/index.ts:1)
- G4 (link) and G5 (language) flag and keep an item instead of refusing it: refusing deleted a fact for a matter of wording or form. (src/recap/domain/gates/language.ts:1) (src/recap/domain/gates/link.ts:2)
- Only the kinds of the tab's own agents (claude, codex, …) are always a narrator, and they come in the context: elsewhere `Hermes` or `Claude` may be what the work is about. (src/recap/domain/gates/narrator.ts:5)

### herdr's wire (transport)

- herdr accepts exactly one `events.subscribe` per connection (a second one resets the socket, measured on herdr 0.9.0), so every call is its own connection and every subscription holds one long-lived connection of its own. (src/transport/herdr.ts:2-3)
- herdr answers a request it could not parse with an empty `id`; the transport treats an empty id as the reply to the call in flight, so that call fails instead of waiting for its timeout. (src/transport/herdr.ts:51)
- The line reader swallows its own `error` events: it re-emits the socket's errors, and every caller already handles them on the socket itself, so a second handler would only turn them into uncaught exceptions. (src/transport/herdr.ts:41)
- A subscription that names a pane herdr does not have is closed with no ack and no error (`closed before the ack`, measured on herdr 0.9.0 in a named session); the informer's recovery from a pane that died unannounced depends on it. (test/informer-recovery.test.ts:12)
- The pane-token rules the lane protocol relies on were measured on herdr 0.9.3: one flat map per pane merged from every source, last write of a name wins, `null` removes a name, values cut to 80 characters, names `[A-Za-z0-9_-]{1,32}`, at most 16 names per source, a time to live of at most 24 hours. `test/fakes/herdr-panes.ts` encodes them and `test/herdr-tokens-pins.test.ts` pins them, so a change in herdr fails there first. (test/fakes/herdr-panes.ts:1)

### Rendering

- `styleText` is called with `validateStream: false` so the colours a render produces never depend on the process's stdout; the composition root chooses `coloured` or `plain`, and the render layer stays pure. (src/recap/render/wrap.ts:87)

## Alternatives considered

- **Keep the comments and forbid new ones.** Rejected: the operator's rule is that the code carries no comments; a
  guard that only checks new code would leave 2,500 comments of rot in place.
- **Delete without triage.** Rejected: some comments hold a rationale or a constraint that no test or name carries,
  and deleting it would lose it.
- **Encode every rationale as a type or a test in this change.** Rejected for this change: it would change signatures
  across about 600 files and add behaviour-bearing edits to a refactor that must be pure. Candidates are recorded in
  section 5 for later changes.
