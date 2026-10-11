# Release checks that need a live agent

These checks cannot run in the test suite, because they depend on how a harness behaves. Run them in a scratch herdr
workspace with throwaway agents, never on a lane that does real work, and record the harness version with the result.

## Claude Code keeps a `/compact` that was typed while it works

Autocompact and requested compactions type `/compact <guidance>` into a Claude Code agent that is still working and rely on
the harness to queue it and run it once after the turn (the plan says `queues`). A Claude Code update that stops queuing
typed input would leave the line in the composer without effect.

1. Start a throwaway Claude Code agent in a temporary directory.
2. Give it a turn that stays open for about thirty seconds, for example a foreground shell command that waits for a file.
3. While herdr reports the agent `working`, type the line the plugin types: `herdr pane send-text <pane> "/compact "`,
   `herdr pane send-text <pane> "keep the queue test"`, wait 300 ms, `herdr pane send-keys <pane> enter`.
4. Pass: the agent's transcript shows the line queued (`queue-operation` / `enqueue`), taken after the turn ends
   (`dequeue`), run as a command (`<command-name>/compact</command-name>`), and exactly one `compact_boundary` row after
   the typing instant.
5. Repeat with a second plain prompt and then a background-task notification arriving while the compaction waits. Pass:
   neither merges with the compaction line; each is taken inside the running turn and the compaction still runs once.

If any step fails, set `whileWorking` of the Claude plan back to `needs-idle` (`src/adapters/compaction-plan-registry.ts`)
before releasing.

## Claude Code keeps background work across `/compact`

An agent's background shells, `Monitor` watchers and background subagents stop holding the in-flight gate because they keep
running across a compaction (`CLAUDE_SPLIT` is `separates`).

1. Start a throwaway Claude Code agent that launches a background shell, a `Monitor` and a background subagent, then ends
   its turn.
2. Type `/compact keep the background tasks` when the agent is idle.
3. Pass: each task's end notice, and the monitor's events, still reach the agent after the `compact_boundary` row.

If any step fails, set `CLAUDE_SPLIT` back to `foreground-only` (`src/adapters/claude-in-flight.ts`) before releasing.
