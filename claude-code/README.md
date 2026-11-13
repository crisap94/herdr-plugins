# `claude-code/`: a session ledger for a plain Claude Code session

The second host of the tab-recap engine. A Claude Code session that runs outside herdr gets a ledger kept for it, driven by
Claude Code hooks, and gets its facts back after a compaction. It reaches the engine only through the facade
`../tab-recap/src/recap/application/engine.ts` (`createEngine`, `Engine`) and the restore text beside it, and it uses
tab-recap's adapters as plug implementations: the SQLite store, the Claude transcript reader and the recap writer over the
claude harness. The folder moves under the session-ledger package later.

Status: the core (step C2 of `openspec/changes/claude-code-host`). The hook launcher, the plugin manifest and the restore on
`SessionStart` come in later steps. Nothing here is installed or enabled anywhere.

## How it is built and checked

| Question | Answer |
| --- | --- |
| Language and runtime | TypeScript on Bun (>= 1.4.4, as tab-recap), no build step |
| How it reaches tab-recap | relative imports `../tab-recap/src/...`. tab-recap's own `#src/*` and `#test/*` imports resolve per file from `tab-recap/package.json`, and its bare imports (`drizzle-orm`, `@stateforge-labs/harness-adapters`) from `tab-recap/node_modules`, because both are looked up from the importing file. Checked: a file here importing `engine.ts` and `database.ts` runs under `bun` and type-checks |
| Dependencies | none of its own: `package.json` has no `dependencies` and no `devDependencies`. The type checker, `@types/node` and ast-grep are tab-recap's, so run `bun install --frozen-lockfile` in `../tab-recap` first |
| A bare import from a file here | does not resolve (there is no `node_modules` here). That is why the harness runtime (`createRuntime` from `@stateforge-labs/harness-adapters/runtime`) is a plug the caller passes in, not something this folder imports; the launcher step settles where the real one comes from |
| Type check | `bun run typecheck`: tab-recap's `tsgo` over `tsconfig.json`, with tab-recap's strict flags (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, ...), `typeRoots` pointed at tab-recap's `@types`, and tab-recap's `types/*.d.ts` and `bun-sqlite.d.ts` included. It also checks every tab-recap file these files import |
| Tests | `bun run test` (`bun test --isolate test/`), `node:test` style like tab-recap |
| House rules | `bun run rules` (`ci/rules.sh`) runs tab-recap's ast-grep rules `recap-no-comments`, `recap-vocabulary`, `recap-no-suppression`, `recap-sqlite-readonly`, `recap-write-transactions`, `recap-no-drizzle-transaction` and `recap-never-types` over `src` and `test`, and checks each one still bites its bad probe |
| Everything | `bun run check` = type check, rules, tests |

**Not covered here by tab-recap's gates.** `tab-recap/ci/lint.sh` and `ci/test.sh` scan only `tab-recap/{src,bin,test}`, and the
repository's CI runs only in `tab-recap/`. So none of these reach this folder: oxlint (its type-aware house rules and unsafe-any
checks), the domain-types ratchet, the dependency-cruiser module graph (including `engine-self-contained` and `domain-pure`),
the lane map `ci/lanes.json`, the engine manifest `ci/engine-files.json`, `recap-no-foreign-write`,
`recap-host-probes-at-the-edge`, `recap-prompt-boundary` and the remaining ast-grep rules. The rules above are applied by
`ci/rules.sh`; the rest is applied by hand: no comments, CONTEXT.md's vocabulary, engine calls only through the facade.

## Owner defaults

Each of these is a default the owner can change.

| Question | Default |
| --- | --- |
| Process model | one short-lived process per hook. `Stop` (async) starts a detached runner (`src/runner.ts`) that takes a per-session lock, waits the settle time (2.5 s, injected so tests do not sleep), calls `engine.refresh(scope, [session])`, and reruns while another `Stop` marked the session dirty meanwhile, at most 3 rounds in one runner. A stale lock (dead pid, or held longer than 20 minutes, which is taken as a reused pid) is stolen. No daemon |
| Identity | one session = one scope (`claude-code:<session_id>`) with one followed session built from the hook's `session_id`; records from its `transcript_path`. The facade keys a followed session by its pane id today, so the pane is the session id too (debt, `engine-boundary` design, Risks) |
| Storage | its own SQLite file `ledger.db` under `${XDG_STATE_HOME:-~/.local/state}/session-ledger/claude-code/`, or `SESSION_LEDGER_STATE_DIR`. Never the herdr plugin's store (`TAB_RECAP_STATE` and `HERDR_PLUGIN_STATE_DIR` are ignored). Locks in `locks/`, errors in `claude-code.log`, both in the same folder |
| No double recaps | the launcher exits 0 silently inside herdr (`HERDR_ENV=1`) and in the engine's own writer runs: every writer run carries `SESSION_LEDGER_WRITER=1` in its environment (`markedRuntime`). herdr wins when both hosts could follow a session |
| Headless runs | `claude -p` is not followed unless `SESSION_LEDGER_HEADLESS=on`, because each followed turn costs a writer run. See below for how a headless run is told |
| Forks | a fork does not inherit its parent's ledger: it has a new session id, so a new scope |
| Model-facing surface | none: the restore text is first person and names no tool; there is no tool or command for the model |
| harness-hooks | not used in v1 (its neutral event drops `transcript_path`, `cwd` and `source`); `src/payload.ts` is a small local parser |
| PreCompact | parsed, but acting on it is off unless `SESSION_LEDGER_PRECOMPACT=on`: unproven by a live capture |

### Telling a headless run

The hook payload does not say. Every captured Claude payload (`harness-kit/packages/hooks/fixtures/claude`, 82 payloads over
33 events) carries no field that names the run mode, and none of the captures is labelled as headless or interactive. The only
candidate is the environment: Claude Code is understood to set `CLAUDE_CODE_ENTRYPOINT` for its own process, which its hooks
inherit, with `cli` for an interactive terminal session and another value for print and SDK runs. That is not proven by a live
capture here (no real `claude` was run), so it cannot be told reliably yet. The safest default, for the launcher step: follow a session only when
`CLAUDE_CODE_ENTRYPOINT` is exactly `cli`, or when `SESSION_LEDGER_HEADLESS=on`; an absent or any other value is taken as
headless and not followed. An IDE session (another entrypoint value) is then not followed by default. The writer runs are
covered twice: the harness library removes `CLAUDE_CODE_ENTRYPOINT` from their environment, and they carry the marker.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `SESSION_LEDGER_STATE_DIR` | `${XDG_STATE_HOME:-~/.local/state}/session-ledger/claude-code` | where the ledger, locks and log live |
| `SESSION_LEDGER_RECAP_LANG` | `ui` | the recap language, read as tab-recap's `TAB_RECAP_RECAP_LANG` |
| `SESSION_LEDGER_LOCALE` | from `LC_ALL`, `LC_MESSAGES`, `LANG`; else `en` | the UI locale `ui` resolves to, as tab-recap's `TAB_RECAP_LOCALE` |
| `SESSION_LEDGER_MODEL`, `SESSION_LEDGER_EFFORT`, `SESSION_LEDGER_TIMEOUT_MS` | tab-recap's claude default model, default effort, 180000 | the writer run |
| `SESSION_LEDGER_CLAUDE_POLICY_ACK` | `off` | as tab-recap's `TAB_RECAP_CLAUDE_POLICY_ACK`: without `on` the claude writer refuses to run on the login store |
| `SESSION_LEDGER_HEADLESS` | off | follow `claude -p` runs too |
| `SESSION_LEDGER_PRECOMPACT` | off | act on `PreCompact` |

## The pieces

| File | Does |
| --- | --- |
| `src/payload.ts` | `parsePayload(text)`: a Claude Code hook payload (JSON on stdin) to a host event: `session`, `records` (`transcript_path`), `cwd`, `name` (`hook_event_name`), and `source` (SessionStart), `trigger` and `instructions` (PreCompact), `trigger` and `compactText` (PostCompact), `lastMessage` (Stop). Malformed input, a non-object, an unknown event, a missing or wrong field give a typed refusal, never a throw |
| `src/compose.ts` | the engine's plugs for this host: the store (tab-recap's `openStore` at `<state>/ledger.db`, which creates and migrates it), the Claude transcript reader rooted at the grandparent of `transcript_path`, the writer (`RecapWriter` over the claude `LibraryHarness`, with the marker), the clock, the repo lookup (`GitLaneRepo`, as the daemon uses), the language. Every one is a plug in `HostPlugs` |
| `src/lock.ts` | the per-session lock file (pid, start time, a token), taken with an exclusive create, stolen when the holder is dead or held too long, released only by its own holder; and the dirty marker |
| `src/runner.ts` | `runAfterStop`: take the lock or mark dirty and return; settle; refresh; rerun while dirty, bounded; release; errors to the log, never thrown |

### Limits found while building it

- **The transcript reader** is tab-recap's `ClaudeTranscripts`, which finds `<root>/<any project folder>/<session>.jsonl`. Rooted at
  the grandparent of `transcript_path`, it finds the hook's file only when that file is named after the session id (it is, for
  every captured payload). When several project folders hold a file of that name it takes the newest by mtime, which may not be
  `transcript_path`. Subagent transcripts are not read.
- **Two processes writing the ledger at once** are safe for short writes: the store runs in WAL mode, every write is a
  `BEGIN IMMEDIATE` transaction (`writeTx`), the connection waits up to 2 s on a busy database (`busy_timeout = 2000` in
  `connection.ts`), and migration re-reads the version inside its transaction, so two first opens migrate once. A test runs two
  processes refreshing two sessions on one fresh ledger at the same moment. A writer holding the database for more than 2 s
  would make the other fail with `SQLITE_BUSY`; the run is then logged and the next `Stop` catches up.
- **The lock** is a file created exclusively, so two racing processes cannot both create it (tested with four processes). A
  steal renames the stale file aside and checks that it moved the file it judged stale; if a fresh holder slipped in, it puts
  that file back. A narrow window remains in which a fresh lock could be replaced by a third process; the cost is one extra
  writer run, never a corrupt ledger. A pid reused by another process looks alive; the 20-minute longest hold bounds that.
- **A `Stop` that marks the session dirty** after the runner's last round, when the runner already ran its 3 rounds, is left
  for the next `Stop`.
- **The writer runtime** cannot be imported from this folder (see above), so `claudeWriter(runtime, env, log)` takes it.
