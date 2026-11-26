# `claude-code/`: a session ledger for a plain Claude Code session

The second host of the session-ledger engine. A Claude Code session that runs outside herdr gets a ledger kept for it, driven by
Claude Code hooks, and gets its facts back after a compaction. It reaches the engine only through the session-ledger facade
(`@stateforge-labs/session-ledger`: `createEngine`, `Engine`), and it reuses the store and the Claude transcript reader of
`agent-sdk-session-ledger`. Its one file that names tab-recap is `src/plugs.ts`: the recap writer over the claude harness, the
git workplaces, the restore and brief renderers and the language setting.

Status: experimental, ported onto the typed engine API. The change is `openspec/changes/claude-code-host`. It is a Claude Code plugin named
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
| How it reaches the engine | the root export of `@stateforge-labs/session-ledger` and `agent-sdk-session-ledger` (workspace packages, declared in `package.json`). No relative path climbs out of this folder from `src/`, except in `src/plugs.ts` |
| The one exception | `src/plugs.ts` imports a closed list of tab-recap files: the Claude writer (`RecapWriter` over `LibraryHarnessPort`), `GitLaneRepo`, `restoreContentOf` and `fitRestore`, `clean` and `guidanceOf`, `sectionsOfOpen`, the language helper and the effort and byte budget helpers. The engine does not export a contract writer or the renderers yet; when it does, the file shrinks to nothing |
| Type check | `bash gates/run.sh typecheck` (`bun run typecheck`): `tsgo` over `tsconfig.json` with the strict flags of `agent-sdk` |
| Tests | `bash gates/run.sh test` (`bun run test`): `bun test --isolate test/`, `node:test` style, over fixture payloads and scratch folders only, with the fake writer of tab-recap's tests; no real `claude`, model or herdr |
| House rules | `bash gates/run.sh lint` (`bun run lint`) runs the boundary rules in `rules/` (`host-facade-boundary` on `src` except `plugs.ts`, `host-plugs-boundary` on `plugs.ts` with its closed list, `host-test-boundary` on `test`), each of which must bite its bad probe and pass its good one, and tab-recap's rules `recap-no-comments`, `recap-vocabulary`, `recap-no-suppression`, `recap-sqlite-readonly`, `recap-write-transactions`, `recap-no-drizzle-transaction` and `recap-never-types` over `src` and `test` |
| Everything | `bash gates/run.sh lint`, `test` and `typecheck`. CI runs them in the `unit:claude-code` job of `.gitlab-ci.yml`, and `tab-recap/gates/run.sh test` runs this folder's tests after agent-sdk's |

**Not covered here.** oxlint, the domain-types ratchet and the dependency-cruiser module graph run for tab-recap and the packages,
not for this folder. The rules above are the ones applied, and they check direct imports only.

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
| `src/compose.ts` | the engine for this host through the facade `createEngine`: the store (`openLedgerStore` of agent-sdk at `<state>/ledger.db`, which creates and migrates it), the Claude transcript reader (`claudeReader`, rooted at the grandparent of `transcript_path`), the writer, the clock, the ids, the workplaces and the language, all plugs in `HostPlugs`. A `reading` engine seals the records (no run is written), has no transcript reader and a writer that refuses, so `compacted` never calls a model in a hook |
| `src/plugs.ts` | the tab-recap side: `claudeWriter` (the marked runtime, the policy acknowledgement), `languageOf`, `gitWorkplaces`, `restoreText` and `restoreBytes` (the 9,000-byte fit as the engine's `settings.restoreText` and `settings.restoreBytes`), `briefOf` (the `PreCompact` line) |
| `src/lock.ts` | the per-session lock file (pid, start time, a token), taken with an exclusive create, stolen when the holder is dead or held too long, released only by its own holder; and the dirty marker |
| `src/runner.ts` | `runAfterStop`: take the lock or mark dirty and return; settle; refresh; rerun while dirty, bounded; release; errors to the log, never thrown |
| `.claude-plugin/plugin.json`, `hooks/hooks.json` | the plugin: its name and the four hooks, each `sh "${CLAUDE_PLUGIN_ROOT}/scripts/hook" <event>` |
| `scripts/hook` | the POSIX sh launcher: silent exit 0 inside herdr (`HERDR_ENV=1`), in a writer run, for a run not known to be interactive, for `PreCompact` unless on, without bun; else `bun src/main.ts <event>` with stderr to the log, and exit 0 whatever happens |
| `src/main.ts`, `src/hook.ts` | stdin payload to an answer: start the runner, print the restore JSON, print the `PreCompact` line, or nothing. Any error goes to the log |
| `src/start-runner.ts`, `src/run.ts`, `src/runner-plugs.ts` | the detached runner: its own process group, stdio to the log; it notes the session, follows it in the engine, then runs `runAfterStop` with the real writer. The harness runtime is loaded lazily by tab-recap's `lazyRuntime` |
| `src/read.ts` | the ledger opened for reading behind the facade (a `reading` engine), for the restore, the brief and the commands; nothing is opened when the ledger file is absent |
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
- **The writer runtime** is a plug: `claudeWriter(runtime, env, log)` takes it, and `src/runner-plugs.ts` passes tab-recap's `lazyRuntime()`.
- **Open facts** of a session are read through its recap's tasks (the engine's `history(scope, key)` is keyed by the task key, which is not the session key), the same way the engine's `compacted` finds them.
- **`show` finds a session** only after its first `Stop` (the runner writes the sessions index), and only from the exact folder
  the session started in; `--session <id>` works from anywhere.

## Not done

- The service: the later version replaces the per-hook runner with a long-lived service, without changing the hooks.
- opencode and codex hosts.
- Marketplace packaging. The plugin imports the workspace packages and `../tab-recap/src`. A marketplace install copies only
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
