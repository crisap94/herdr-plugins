# `claude-code/`: a session ledger for a plain Claude Code session

The second host of the tab-recap engine. A Claude Code session that runs outside herdr gets a ledger kept for it, driven by
Claude Code hooks, and gets its facts back after a compaction. It reaches the engine only through the facade
`../tab-recap/src/recap/application/engine.ts` (`createEngine`, `Engine`) and the restore text beside it, and it uses
tab-recap's adapters as plug implementations: the SQLite store, the Claude transcript reader and the recap writer over the
claude harness. The folder moves under the session-ledger package later.

Status: experimental, steps C1 to C3 of `openspec/changes/claude-code-host`. It is a Claude Code plugin named
`session-ledger`, with the hooks, the launcher and a terminal command for the human. It has not been run against a real Claude
Code session (see "Not checked live"). Nothing here is installed or enabled anywhere.

## What it does

| When Claude Code fires | The plugin |
| --- | --- |
| `Stop` (async) | starts a detached runner and returns at once. The runner waits 2.5 s for the transcript, then brings the session's ledger up to date with one writer run. It runs again if another `Stop` arrived meanwhile |
| `PostCompact` (async) | the same: the transcript reader finds the compaction boundary |
| `SessionStart` with `compact` or `resume` | puts the session's open facts back into the context, as first-person notes that name no tool (`additionalContext`) |
| `SessionStart` with `startup`, `clear` or `fork` | nothing (the matcher does not even start it) |
| `PreCompact` | nothing, unless `SESSION_LEDGER_PRECOMPACT=on`: then one line of instructions for the compaction, built from the open facts by tab-recap's compaction template, with no model call |

The model never hears about the plugin. The restore text is first person and names no tool, plugin, recap, tab or ledger. There
is no tool, skill or slash command for the model. The human's command is not in the plugin's `bin/` folder, because Claude Code
puts that folder on the Bash tool's `PATH`.

## Try it locally

```bash
cd ../tab-recap && bun install --frozen-lockfile        # the engine's dependencies, once
claude --plugin-dir <repo>/claude-code                    # an interactive session with the hooks loaded
<repo>/claude-code/scripts/session-ledger show            # in the same folder, after a turn: the ledger, read-only
```

The writer runs claude on your login. As in tab-recap, it refuses to run until you set `SESSION_LEDGER_CLAUDE_POLICY_ACK=on`
in the environment Claude Code starts with. Until then, every turn logs a refusal to `claude-code.log` and nothing is
written.

For a status line, call `session-ledger line` from your status-line command. It reads the status line's JSON on stdin and prints
`ledger <n> open · <time> UTC`, or nothing:

```bash
#!/bin/sh
input=$(cat)
printf '%s' "$input" | <repo>/claude-code/scripts/session-ledger line
```

## What it costs

One writer run per followed turn: each `Stop` (and each `PostCompact`) of a followed session is a headless claude call on the
recap model (`SESSION_LEDGER_MODEL`, tab-recap's claude default otherwise). `Stop`s that arrive during a run are folded into one
rerun. Restores, `PreCompact`, `show` and `line` read the ledger and make no model call.

## How it is built and checked

| Question | Answer |
| --- | --- |
| Language and runtime | TypeScript on Bun (>= 1.4.4, as tab-recap), no build step |
| How it reaches tab-recap | relative imports `../tab-recap/src/...`. tab-recap's own `#src/*` and `#test/*` imports resolve per file from `tab-recap/package.json`, and its bare imports (`drizzle-orm`, `@stateforge-labs/harness-adapters`) from `tab-recap/node_modules`, because both are looked up from the importing file. Checked: a file here importing `engine.ts` and `database.ts` runs under `bun` and type-checks |
| Dependencies | none of its own: `package.json` has no `dependencies` and no `devDependencies`. The type checker, `@types/node` and ast-grep are tab-recap's, so run `bun install --frozen-lockfile` in `../tab-recap` first |
| A bare import from a file here | does not resolve (there is no `node_modules` here). That is why the harness runtime (`createRuntime` from `@stateforge-labs/harness-adapters/runtime`) is a plug the caller passes in. The runner imports the real one from tab-recap's `node_modules` by relative path (`src/runner-plugs.ts`) |
| Type check | `bun run typecheck`: tab-recap's `tsgo` over `tsconfig.json`, with tab-recap's strict flags (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, ...), `typeRoots` pointed at tab-recap's `@types`, and tab-recap's `types/*.d.ts` and `bun-sqlite.d.ts` included. It also checks every tab-recap file these files import |
| Tests | `bun run test` (`bun test --isolate test/`), `node:test` style like tab-recap |
| House rules | `bun run rules` (`ci/rules.sh`) runs tab-recap's ast-grep rules `recap-no-comments`, `recap-vocabulary`, `recap-no-suppression`, `recap-sqlite-readonly`, `recap-write-transactions`, `recap-no-drizzle-transaction` and `recap-never-types` over `src` and `test`, and checks each one still bites its bad probe. Its own rule `host-engine-boundary` (`rules/host-engine-boundary.yml`) lets `src` and `test` import from `tab-recap/src/` only the facade `engine.ts`, the restore and compaction helpers, `recap/domain/`, `ports/`, `i18n/` and the plug adapters `db`, `git`, `transcripts`, `harness` and `job`; never the daemon, `adapters/herdr`, the column, setup, compact or the protocol. It must reject its bad probe and pass its good one |
| Everything | `bun run check` = type check, rules, tests. CI runs it in the `claude-code` job of `.gitlab-ci.yml` and `.github/workflows/ci.yml` |

**Not covered here by tab-recap's gates.** `tab-recap/ci/lint.sh` and `ci/test.sh` scan only `tab-recap/{src,bin,test}`, and the
repository's CI runs them only there (this folder has its own `claude-code` job). So none of these reach this folder: oxlint (its type-aware house rules and unsafe-any
checks), the domain-types ratchet, the dependency-cruiser module graph (including `engine-self-contained` and `domain-pure`),
the lane map `ci/lanes.json`, the engine manifest `ci/engine-files.json`, `recap-no-foreign-write`,
`recap-host-probes-at-the-edge`, `recap-prompt-boundary` and the remaining ast-grep rules. The rules above are applied by
`ci/rules.sh`; the rest is applied by hand. The rule checks direct imports only; what an allowed adapter imports in turn is tab-recap's module graph's job.

## Owner defaults

Each of these is a default the owner can change: the settings below, or the code named in each row.

| Question | Default |
| --- | --- |
| Process model | one short-lived process per hook. `Stop` (async) starts a detached runner (`src/runner.ts`) that takes a per-session lock, waits the settle time (2.5 s, injected so tests do not sleep), calls `engine.refresh(scope, [session])`, and reruns while another `Stop` marked the session dirty meanwhile, at most 3 rounds in one runner. A stale lock (its pid is gone, or the pid now names a process with another start time, a reused pid) is stolen; a live holder keeps it however long it runs. No daemon |
| Identity | one session = one scope (`claude-code:<session_id>`) with one followed session built from the hook's `session_id`; records from its `transcript_path`. The facade keys a followed session by its pane id today, so the pane is the session id too (debt, `engine-boundary` design, Risks) |
| Storage | its own SQLite file `ledger.db` under `${XDG_STATE_HOME:-~/.local/state}/session-ledger/claude-code/`, or `SESSION_LEDGER_STATE_DIR`. Never the herdr plugin's store (`TAB_RECAP_STATE` and `HERDR_PLUGIN_STATE_DIR` are ignored). Locks in `locks/`, errors in `claude-code.log`, both in the same folder |
| No double recaps | the launcher exits 0 silently inside herdr (`HERDR_ENV=1`) and in the engine's own writer runs: every writer run carries `SESSION_LEDGER_WRITER=1` in its environment (`markedRuntime`). herdr wins when both hosts could follow a session |
| Headless runs | `claude -p` is not followed unless `SESSION_LEDGER_HEADLESS=on`, because each followed turn costs a writer run. See below for how a headless run is told |
| Forks | a fork does not inherit its parent's ledger: it has a new session id, so a new scope. `/clear` likewise starts empty |
| Model-facing surface | none: the restore text is first person and names no tool; there is no tool or command for the model |
| harness-hooks | not used in v1 (its neutral event drops `transcript_path`, `cwd` and `source`); `src/payload.ts` is a small local parser |
| PreCompact | off unless `SESSION_LEDGER_PRECOMPACT=on`: unproven by a live capture. The launcher skips it before starting bun |
| Restore size | fitted to 9,000 bytes, below Claude Code's 10,000-character cap on a hook's context, over which the text is saved to a file and only a preview reaches the model |

### Telling a headless run

It cannot be told reliably. The hooks reference documents no payload field that names the run mode, and none of the 82 captured
Claude payloads (33 events) has one. The documented variables `CLAUDECODE=1` and `CLAUDE_CODE_CHILD_SESSION=1` are set in
every hook's environment, interactive or `-p`. The only candidate is `CLAUDE_CODE_ENTRYPOINT`, which Claude Code is understood
to set to `cli` for an interactive terminal session. It is not in the documented environment variables, and no live capture
here proves it. So the launcher takes the safest reading: it follows a session only when `CLAUDE_CODE_ENTRYPOINT` is exactly
`cli`, or when `SESSION_LEDGER_HEADLESS=on`. An absent or any other value is treated as headless and costs nothing. An IDE
session (another entrypoint value) is then not followed by default. If a live session shows that interactive hooks do not
see `cli`, nothing is followed until `SESSION_LEDGER_HEADLESS=on`. The writer runs are excluded twice: the harness library
removes `CLAUDE_CODE_ENTRYPOINT` from their environment, and they carry the marker.

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
| `SESSION_LEDGER_RUNNER` | `src/run.ts` | the script the detached runner runs (the tests start a fake one; the later service can replace it) |

## The pieces

| File | Does |
| --- | --- |
| `src/payload.ts` | `parsePayload(text)`: a Claude Code hook payload (JSON on stdin) to a host event: `session`, `records` (`transcript_path`), `cwd`, `name` (`hook_event_name`), and `source` (SessionStart), `trigger` and `instructions` (PreCompact), `trigger` and `compactText` (PostCompact), `lastMessage` (Stop). Malformed input, a non-object, an unknown event, a missing or wrong field give a typed refusal, never a throw |
| `src/compose.ts` | the engine's plugs for this host: the store (tab-recap's `openStore` at `<state>/ledger.db`, which creates and migrates it), the Claude transcript reader rooted at the grandparent of `transcript_path`, the writer (`RecapWriter` over the claude `LibraryHarness`, with the marker), the clock, the repo lookup (`GitLaneRepo`, as the daemon uses), the language. Every one is a plug in `HostPlugs` |
| `src/lock.ts` | the per-session lock file (pid, start time, a token), taken with an exclusive create, stolen when the holder is dead or held too long, released only by its own holder; and the dirty marker |
| `src/runner.ts` | `runAfterStop`: take the lock or mark dirty and return; settle; refresh; rerun while dirty, bounded; release; errors to the log, never thrown |
| `.claude-plugin/plugin.json`, `hooks/hooks.json` | the plugin: its name and the four hooks, each `sh "${CLAUDE_PLUGIN_ROOT}/scripts/hook" <event>` |
| `scripts/hook` | the POSIX sh launcher: silent exit 0 inside herdr (`HERDR_ENV=1`), in a writer run, for a run not known to be interactive, for `PreCompact` unless on, without bun; else `bun src/main.ts <event>` with stderr to the log, and exit 0 whatever happens |
| `src/main.ts`, `src/hook.ts` | stdin payload to an answer: start the runner, print the restore JSON, print the `PreCompact` line, or nothing. Any error goes to the log |
| `src/start-runner.ts`, `src/run.ts`, `src/runner-plugs.ts` | the detached runner: its own process group, stdio to the log; it notes the session, then runs `runAfterStop` with the real writer. The harness runtime is a relative import of tab-recap's installed `@stateforge-labs/harness-adapters` `dist/src/runtime` |
| `src/read.ts` | the ledger opened read-only (`connectReadOnly`) behind the facade, for the restore and the commands |
| `src/sessions.ts` | `<state>/sessions/<session>.json`: the folder and transcript of each followed session, for `show` |
| `scripts/session-ledger`, `src/cli.ts`, `src/show.ts` | the human's command: `show [--session <id>]` (the newest session started in this folder) and `line`. Exit 0, 1 nothing kept, 2 usage, 3 no bun |

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
  writer run, never a corrupt ledger. The lock records its holder's start time (`/proc/<pid>/stat`), so a reused pid is told
  from the holder; no clock limit is used, so a suspend or a slow writer never loses a live holder its lock. Where `/proc` is
  missing the start time is not kept and a reused pid looks alive until that process exits.
- **A `Stop` that marks the session dirty** after the runner's last round, when the runner already ran its 3 rounds, is left
  for the next `Stop`.
- **The writer runtime** cannot be a bare import from this folder (see above). `claudeWriter(runtime, env, log)` takes it, and
  `src/runner-plugs.ts` imports the real one from tab-recap's `node_modules` by relative path, tied to that package's `dist` layout.
- **`show` finds a session** only after its first `Stop` (the runner writes the sessions index), and only from the exact folder
  the session started in; `--session <id>` works from anywhere.

## Not done

- The service: the later version replaces the per-hook runner with a long-lived service, without changing the hooks.
- opencode and codex hosts.
- Marketplace packaging. The plugin imports `../tab-recap/src` and tab-recap's `node_modules`. A marketplace install copies only
  this folder, so it needs a bundle first (one file built from `src/run.ts`, `src/main.ts` and `src/cli.ts`).

## Not checked live

No real Claude Code session, `claude -p` run or model call was made while building this. These checks are left to the owner:

1. `claude -p "<prompt>" --plugin-dir <repo>/claude-code` (with `SESSION_LEDGER_HEADLESS=on` and
   `SESSION_LEDGER_CLAUDE_POLICY_ACK=on`), then `claude -p --resume <id> ...`. The ledger has one run per turn under
   `claude-code:<session_id>`, and the resumed session's context holds the restore text.
2. Interactive `/compact`. The restore arrives after the compaction and names no tool. `show` lists the facts.
3. The same session inside herdr (`HERDR_ENV=1`) leaves this host's ledger empty.
4. What `CLAUDE_CODE_ENTRYPOINT` a hook sees in an interactive terminal session, in a `-p` run and in an IDE session.
5. Whether `--resume` keeps the `session_id`. The restore is keyed by it.
6. `PreCompact` with `SESSION_LEDGER_PRECOMPACT=on`: the line reaches the compaction's instructions, and the compacted
   context keeps what it lists.
7. The detached runner outlives a `-p` run's teardown, and `bun` is on the `PATH` Claude Code gives its hooks.
