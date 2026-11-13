# Design: a third host for the engine, the Claude Agent SDK in process

## Context

The second host (`claude-code/`) is a set of shell-launched hooks: each hook starts a process, reads its payload from stdin and
answers on stdout. The Claude Agent SDK's `query()` takes the same hook events as in-process callbacks in `options.hooks`, so a
program can keep a ledger for its session without a launcher and without a process per hook.

The facts the design rests on, from the SDK's documentation (the contract), and what the installed types say:

| Fact | Documented | Installed types (0.3.311) |
| --- | --- | --- |
| `query({ prompt, options })` returns `Query`, an `AsyncGenerator<SDKMessage, void>` with `interrupt()`, `getContextUsage()`, `close()` | yes | as documented |
| `options.hooks` is `Partial<Record<HookEvent, HookCallbackMatcher[]>>`; a callback is `(input, toolUseID, { signal }) => Promise<output>`; `{}` means nothing | yes | as documented; see the differences below |
| Every hook input carries `session_id`, `cwd`, `hook_event_name`, `transcript_path` | `transcript_path` among the common fields | `transcript_path` is a required string in `BaseHookInput` |
| `SessionStart` adds `source` (`startup`, `resume`, `clear`, `compact`, `fork`) and `model` | yes | as documented |
| `PostCompact` adds `trigger` and `compact_summary` | yes | `compact_summary` is a required string |
| `PreCompact` adds `trigger` and `custom_instructions` | yes | `custom_instructions` is `string | null`; there is no `PreCompactHookSpecificOutput`, so no compaction instructions can be typed as a callback output |
| `Stop` adds `stop_hook_active` and `last_assistant_message`; its output may carry `decision` and `additionalContext` | yes | `Stop` `decision` is `'approve' | 'block'`; `StopHookSpecificOutput` has `additionalContext`; this host returns neither |
| `SessionStart` output may be `hookSpecificOutput: { hookEventName, additionalContext }` | yes | as documented |
| `UserPromptSubmit` input has `source` (`user`, `sdk`, ...); its output may carry `additionalContext` | `UserPromptSubmit` listed | `source` present; `UserPromptSubmitHookSpecificOutput` has `additionalContext` |
| `HookCallbackMatcher` is `{ matcher?, hooks, timeout?, onFailure? }` | yes | has `onFailure: 'continue' | 'block'`, which does not apply to `Stop` |
| `HookEvent` lists the events | `SessionStart`, `SessionEnd`, `Stop`, `SubagentStop`, `UserPromptSubmit`, `PreCompact`, `PostCompact`, `PreToolUse`, `PostToolUse` among them | 33 events |
| `{ async: true, asyncTimeout }` runs a callback without blocking but cannot inject context | yes | as documented |
| Whether an SDK callback can return compaction instructions | not documented | no field for it: the design does not rely on it |
| Whether an SDK callback receives `SessionStart` with `source` `compact` | not confirmed | not decidable from types |
| When a transcript JSONL is flushed during a live session | not documented | not decidable from types |
| The init message is `system`/`init` with `session_id`; a compaction is `system`/`compact_boundary` with `compact_metadata`; the result message carries `total_cost_usd`, `usage`, `modelUsage` | yes | as documented |
| Node 18.14+ is documented; Bun is not | yes | `engines` in the package: `node >=18.14`; peers `zod ^4`, `@anthropic-ai/sdk >=0.93`, `@modelcontextprotocol/sdk ^1.29` |
| `options.plugins: [{ type: 'local', path }]`; `options.settingSources` defaults to all CLI sources, so user and project hooks load by default; `[]` disables them | yes | as documented |
| Auth comes from the host process environment; the package bundles a Claude Code binary through optional dependencies | yes | optional dependencies are omitted in this repository's install |

Other context: the engine's facade (`tab-recap/src/recap/application/engine.ts`) returns facts, and the restore text is a render
beside it (`engine-boundary`, `restore-text`). A followed session is keyed by its pane today, so the session id stands in for the
pane (`claude-code-host` design, D4, debt in `engine-boundary` Risks).

## Decisions

### D1. Shared code is imported from `claude-code/src`, not moved

`agent-sdk/` imports `claude-code/src` by relative path: `compose.ts` (the plugs: the store, the reader, the writer, the clock,
the repo lookup, the language), `hook.ts` (`restoreFitted`, `factsOf`), `lock.ts`, `payload.ts` (`recordsMatchSession`
through `compose.ts`), `read.ts`, `runner.ts` (`runAfterStop`), `runner-plugs.ts` and `sessions.ts`. Those modules have no
top-level side effects. The only change to claude-code is `hook.ts` exporting `factsOf`, whose first parameter becomes
`HookSession` and whose deps become `Pick<HookDeps, 'stateDir' | 'clock' | 'log'>`; its body is unchanged, and the existing
calls still type-check.

The reuse is also the identity: an SDK session is a Claude Code session, so the scope is `claude-code:<session_id>`, the default
state dir, the ledger file, the lock dir and the sessions index are the claude-code host's. `show` and `line` then work for an SDK
session, and any double following collapses onto the same lock.

Moving the shared pieces into a neutral folder (`hosts/core` or `session-host/`) was the alternative. It was not taken: it touches
every claude-code import and its tests for no gain while there are two importers, and the boundary rule of each host stays
meaningful with a relative import.

The boundary rule `sdk-host-boundary` (`agent-sdk/rules/sdk-host-boundary.yml`) allows imports from `tab-recap/src/` only the
facade `recap/application/engine.ts`, `recap/domain/`, `ports/`, and the claude-code modules named above plus `claude-code/test/support/`.
It rejects the claude-code entry points (`main`, `run`, `cli`, `show`, `start-runner`, `stdin`), the scripts, and every tab-recap
adapter. Claude-code's own rule `host-engine-boundary` is unchanged.

### D2. The public API: `createSessionLedger(settings)` and `mergeHooks`

`src/index.ts` exports:

- `createSessionLedger(settings?)` returns `{ hooks, env, settled(), close() }`. `hooks` is the object to merge into `options.hooks`;
  `env` is the object to spread into `options.env`; `settled()` resolves when no refresh is pending; `close()` refuses new refreshes
  and awaits `settled()`.
- `mergeHooks(...sets)` merges hook sets, event by event, concatenating the matcher lists, so no callback of the program's own is
  dropped.

Settings, all optional: `stateDir` (default the claude-code host's default), `language`, `env` (the environment the host reads its
switches from; default the process environment), `restoreOnNextPrompt` (false), `precompactMessage` (false), `settleMs` (2500, the
claude-code runner's settle, injectable so tests do not sleep).

No other symbol is public. The host returns plain objects; the SDK's types are imported with `import type` only.

### D3. Per-event behaviour

| Event | Behaviour |
| --- | --- |
| `Stop` | parse the input (`parsePayload(JSON.stringify(input))`), check that the transcript is named after the session (`recordsMatchSession`), start a refresh, return `{}` at once. Never blocks the turn; never returns `decision` or `additionalContext` |
| `PostCompact` | the same as `Stop`: the transcript reader finds the compaction boundary |
| `SessionStart` with `source` `compact` or `resume` | `factsOf(input, deps, restoreFitted)` (the claude-code host's answer, reused); return `{ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }`, or `{}` when the text is empty |
| `SessionStart` with any other source | `{}` |
| `PreCompact` | registered only with `precompactMessage: true`; returns `{ systemMessage: brief }` built as the claude-code host builds its line (`briefOf`). Experimental: the SDK's output type has no compaction-instructions field, so the line is shown as a system message, not used as the summary's instructions |
| `UserPromptSubmit` | registered only with `restoreOnNextPrompt: true`; see D6 |

A callback that throws is logged to the host's log file and answers `{}`; it never fails the query.

### D4. In-process serialization

`src/refreshes.ts` keeps a `Map<session, Promise>`. A `Stop` or `PostCompact` for a session with no running refresh starts one. One
for a session with a running refresh marks it dirty; the loop reruns once per batch, so any number of `Stop`s during a run fold
into one rerun. Each round is claude-code's `runAfterStop` (file lock or dirty marker, settle, `engine.refresh`, rerun while dirty,
bounded). So the in-process map orders the callbacks of one program, and the file lock keeps a second process following the same
session safe.

`settled()` loops `Promise.allSettled` over the map until it is empty, so a refresh started while waiting is awaited too.
`close()` sets a closed flag that refuses new starts, then awaits `settled()`.

### D5. Double following

`followerOf(env)` decides, from the environment the program gives the host:

| Environment | Result |
| --- | --- |
| `HERDR_ENV=1` | herdr follows: hooks `{}`, env `{}` |
| `SESSION_LEDGER_WRITER=1` | the engine's own writer run: hooks `{}`, env `{}`; the writer runs are separate processes started with a marker, and this host's hooks exist only in the program's own query, so they are never followed by it |
| otherwise | this host follows: `hooks` set, `env` is `{ SESSION_LEDGER_HOST: 'agent-sdk' }` |

The program spreads `env` into `options.env`. The claude-code launcher (`scripts/hook`) exits 0 silently when `SESSION_LEDGER_HOST` is
`agent-sdk`, before anything else, so a session followed in process is never followed by the plugin, even when the plugin would
follow a `cli` or a headless run.

Without the marker the SDK alone would keep the plugin out of most cases: the SDK sets `CLAUDE_CODE_ENTRYPOINT=sdk-ts` in its child
process when the variable is unset (seen in the SDK's `sdk.mjs`), and the launcher follows only `cli` or `SESSION_LEDGER_HEADLESS=on`.
That is an observed value, not a documented one, so the marker is the explicit rule; the entrypoint is the fallback, not the decision.
Where the owner sets `SESSION_LEDGER_HEADLESS=on` or inherits `CLAUDE_CODE_ENTRYPOINT=cli`, the two hosts can both follow the session:
they then share one lock and one scope, so the refreshes are serialized and the second is a no-op for the same turn.

The host reads `HERDR_ENV` and `SESSION_LEDGER_WRITER` from `settings.env`, defaulting to the process environment, and the tests
pass both explicitly.

### D6. The SessionStart(compact) fallback, off by default

Whether an SDK callback receives `SessionStart` with `source` `compact` is not confirmed. With `restoreOnNextPrompt: true`, the host
does not depend on it:

1. `PostCompact` marks the session owed, unless a `SessionStart(compact)` already served it.
2. `SessionStart(compact)` clears owed and marks served (so the restore is not returned twice when both arrive).
3. The next `UserPromptSubmit` returns the restore once as `additionalContext` and clears owed.

The state is per session, in process, and lost when the program exits. The default is off, so the normal path is `SessionStart`
alone. Choosing between the two needs a live check: whether the SDK delivers `SessionStart(compact)` to the callbacks. Until then the
option is experimental and its README section says so.

### D7. PreCompact, experimental

`precompactMessage` returns `{ systemMessage }`, built from the open facts by the claude-code host's brief. Off by default. The
SDK documents compaction instructions only for command hooks (stdout on exit 0, 10,000 characters at most), and the SDK's callback
output type has no field for them. The switch is experimental for that reason, and the README says so.

### D8. SDK types: a pinned devDependency, type-only imports

`@anthropic-ai/claude-agent-sdk` is a devDependency pinned to `0.3.311` exactly (the repository pins exactly), and a peer dependency
`^0.3.311` for the program that uses the host. The host imports its hook types with `import type` only, so nothing from the SDK is
loaded at run time. The install uses `--omit=optional`, so the bundled Claude Code binary is not downloaded: the types do not need it.
The SDK's own peer dependencies (`zod`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`) are not installed here, and the type check
does not need them; the installed types were checked against the facts in the Context table, and the differences are listed there.

## Risks

- The SDK's behaviour is documented as a contract, but three facts are unproven: whether `SessionStart(compact)` reaches the
  callbacks (D6), whether a callback can return compaction instructions (D7), and when a transcript is flushed during a live session
  (the settle wait, D1, is injectable and set to 2.5 s by default). Each is designed for both outcomes and needs a live check.
- Bun is not a documented runtime for the SDK (Node 18.14+ is). The host is written for Bun as claude-code is; the program that uses
  it chooses its runtime, and the example is written for Node-compatible use. Not checked live.
- The restore text frames the writer's facts as the agent's own notes; they can lag and must be checked against the worktree, as
  in the claude-code host.
- Two processes following one session share one lock file and one scope; a stale lock of a dead process is stolen, as in
  `claude-code-host` D4. A live holder keeps its lock however long it runs.
- The in-process map orders one program's refreshes only. It does not see a second program: that is the file lock's job, and its
  narrow race (`claude-code-host` Risks) applies.
- Double following is prevented by the marker only where the launcher runs. If the plugin is loaded with a launcher older than the
  marker, both hosts can follow the session when `CLAUDE_CODE_ENTRYPOINT=cli` or `SESSION_LEDGER_HEADLESS=on` is set; they then share
  one lock, so the cost is an extra no-op round, never a second ledger.
- `PostCompact` supplies `compact_summary`, a required string in the types, which this host does not use (the transcript is read).
  The field is a fact of the contract, not a source for the ledger.
- A `/clear` starts a new session id, so the restore of the new session is empty (`claude-code-host` Risks). `fork` starts a new id
  and a new scope.
- Settings, the environment and the SDK's `Options.env` are the program's: anyone who can set the host's environment can run code in
  the runner, as in `claude-code-host`.
- The SDK's hook output type for `Stop` offers `decision` and `additionalContext`; the host never returns them, and a test asserts
  that its `Stop` answer is exactly `{}`.

## Hand-written pieces kept

`mergeHooks` and `followerOf` are small hand-written functions; no library provides the marker rule or the event-by-event merge over
the SDK's optional matcher lists. The restore render is the claude-code host's, reused.
