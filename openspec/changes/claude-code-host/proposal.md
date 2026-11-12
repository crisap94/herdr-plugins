# Proposal: a second host for the engine, a plain Claude Code session

## Why

`engine-boundary` drew the engine's line and proved, in a test, that it runs with no herdr. Nothing outside tests uses it that way
yet. A plain Claude Code session (no herdr) loses where its work stood when its context is compacted or when it is resumed. The
engine can keep a ledger for that session from its transcript and give the facts back at those moments, driven by Claude Code's
own hooks. Building that host is also what proves the boundary: it reaches the core only through the facade.

## What changes

- A new capability `restore-text` in tab-recap: the facade gains `Engine.restore(scope, session)`, which returns the facts a
  host puts back (open and recently closed facts of one scope and followed session, with the time of the last good run), and a
  pure `restoreTextOf` renders them as a first-person text addressed to the same agent, in the handoff's groups and byte budget,
  naming no plugin word, tool, ledger or other agent. It reads only the store: no tab view, no pane token, no same-lane refusal.
- The handoff's grouping (sanitising, the forbidden-words check, the caps) moves to `application/handoff-groups.ts` and its
  budget fitting takes a serializer, so the handoff text and the restore text share both; the handoff's bytes do not change.
- A new top-level folder `claude-code/` beside `tab-recap/`: a launcher run by Claude Code hooks (`SessionStart` on `compact`
  and `resume` returns the restore text as `additionalContext`; `Stop` starts a detached runner that refreshes the ledger;
  `PostCompact` reports the compaction), with its own SQLite file and a small local payload parser. It reaches the engine only
  through `createEngine` and uses tab-recap's adapters as plugs (the SQLite store, the Claude transcript reader, the writer
  harness).
- One new noun in `tab-recap/CONTEXT.md`: **Restore text**.

## Out of scope

- A daemon or service: one short-lived process per hook in this change.
- `PreCompact` (a brief as the summary's instructions) is off unless `SESSION_LEDGER_PRECOMPACT=on`; turning it on by default
  waits for one live capture.
- `harness-hooks`: its neutral event drops `transcript_path`, `cwd` and `source`; a local parser is used instead.
- Any model-facing tool or command: the agent never hears about the host.
- The worksite snapshot in the restore text (it needs git and herdr's pane tokens).
- The retyping of the facade to its own followed session (`engine-boundary` Risks): the host keys a followed session by its
  session id, as the plain-session test does, and the debt stays named.
- The physical move of the engine to its own package, and any change to the herdr plugin's behaviour.

## Changelog label

`changelog::internal`. The changelog is the herdr plugin's, written for its users. This change adds a facade method and a pure
render that the plugin does not call, and a host in a folder the plugin's release does not ship; nothing a plugin user runs
changes. The host gets its own label when it ships to anyone.
