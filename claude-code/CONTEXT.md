# claude-code

The Claude Code host of the session ledger: a plain Claude Code session driven by hooks, no herdr.

The host reaches the engine through the `@stateforge-labs/session-ledger` root export and `agent-sdk-session-ledger` only. The one
exception is `src/plugs.ts`, which names the tab-recap files for the Claude writer, the git workplaces and the restore and brief
renderers. The boundary rules are in `rules/`.
