# Proposal: a third host for the engine, the Claude Agent SDK in process

## Why

The engine runs with no herdr (`engine-boundary`), and a plain Claude Code session already has a host (`claude-code-host`) that
runs shell-launched hooks, one short-lived process per hook. A program built on the Claude Agent SDK's `query()` runs the same
kind of session without a terminal and without a Claude Code hook launcher, so it loses where its work stood at a compaction or a
resume the same way. The SDK takes hook callbacks in process, so the ledger can be kept by a host that is a library: no launcher,
no process per hook, and the program decides when it exits.

## What changes

- A new top-level folder `agent-sdk/` beside `claude-code/` and `tab-recap/`: a library whose `createSessionLedger(settings)`
  returns `{ hooks, env, settled(), close() }`, where `hooks` is merged into the SDK's `options.hooks` and `env` into
  `options.env`. `mergeHooks(...sets)` merges hook sets without dropping any callback.
- Events: `Stop` and `PostCompact` start a refresh of the session's ledger and return `{}` at once; `SessionStart` with `compact`
  or `resume` returns the restore text as `additionalContext`, or `{}` when it is empty; every other source returns `{}`.
- Refreshes for one session run one at a time inside the process; a `Stop` during a running refresh marks it dirty and it reruns
  once. Each round is the claude-code host's `runAfterStop`, under its file lock, so another process following the same session
  stays safe.
- Double following is decided from the environment: inside herdr (`HERDR_ENV=1`) or in the engine's own writer run
  (`SESSION_LEDGER_WRITER=1`) this host installs no hooks. Otherwise it sets `SESSION_LEDGER_HOST=agent-sdk` in `env`, and the
  claude-code launcher exits 0 on that marker.
- The host reuses the claude-code host's pieces by import (`claude-code/src`): the composition of the store, reader and writer,
  the restore answer, the per-session lock and the session identity (scope `claude-code:<session_id>`). Nothing is moved.
- Experimental, off by default: `restoreOnNextPrompt` returns the restore once from the next `UserPromptSubmit` when a compaction
  was seen but its `SessionStart` never reached the callbacks; `precompactMessage` returns a `systemMessage` from `PreCompact`.
- The SDK's TypeScript types are a pinned devDependency (`@anthropic-ai/claude-agent-sdk` 0.3.311), used for type-checking only;
  the host returns plain objects.
- A check for the folder (`bun run check`), a boundary rule `sdk-host-boundary` with bad and good probes, and a CI job.
- An example program `agent-sdk/examples/run.ts` that shows the use with `query()`. It is written and type-checked, and never run
  here.

## Out of scope

- The Python SDK: it lacks `SessionStart`, `SessionEnd` and `PostCompact` for hooks.
- A service or daemon: the host lives inside the program that calls `query()`.
- Bundling or publishing the package: it stays a folder in this repository, private.
- Running the example, or any real model call, real `claude` process or real SDK query, in this change.
- Any change to the claude-code host's behaviour beyond the marker and the exported `factsOf`.
- The worksite snapshot in the restore text, and the facade's retyping to its own followed session (`engine-boundary` Risks).

## Changelog label

`changelog::internal`. The host is in a folder the herdr plugin's release does not ship, and it has no user yet. It gets its own
label when it ships to anyone.
