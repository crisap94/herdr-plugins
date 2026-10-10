# Design

## Reader capability

`Transcripts.inFlight` is a required sum: `supported` carries a read function returning the existing in-flight result, and `unsupported` carries its reason. The compiler requires the registry's Claude, Codex and opencode readers to implement the same contract. The screen reader declares that a screen contains no transcript work. The gate takes unsupported wording from that value; a missing exact or fallback reader uses the single `unregistered-reader` reason.

Codex scans JSONL rows from the most recent `task_started`. It pairs tool calls with outputs by `call_id`, and tracks yielded cells by the fixed `Script running with cell ID` and `Script completed` markers. The reader starts at 2 MiB, doubles to 16 MiB while a truncated tail leaves an open call uncertain, and answers unknown at the bound. It reads no message text. The pure scanner is kept by hand because no Node built-in understands this rollout record format or its cell markers.

The opencode reader selects tool parts belonging to the session's newest messages and counts only `pending` and `running` states. The query is a fixed prepared statement over Node's built-in SQLite interface; that API has no typed query builder, so the statement stays explicit and static. JSON state is parsed at the adapter edge. Database errors use the existing `unreadable` result.

## Idle liveness and shadow decisions

The sweep already selects herdr `idle` and `done` statuses. It also checks autocompact activity and queued work before reading in-flight state. If an idle or done lane reports a positive transcript count, the count is treated as zero for the gate and a `stale: idle pane with open work` log line is written. A lane that is working is not considered by the sweep. This follows the proposed idle rule; it does not infer Codex cell liveness beyond herdr status.

`TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS` parses to registered transcript kinds at the configuration edge and defaults to empty. Those kinds run the full gate and decider while the global mode is on, record with mode `shadow`, and use the existing `recordOnly` path to prevent compact requests, including when also named in `TAB_RECAP_AUTOCOMPACT_KINDS`. Kinds omitted from the compactable list keep their existing record-only behavior. The operator reads the decisions with `tab-recap autocompact`. The default compactable kind list remains Claude.

## Open questions

- A Codex yielded cell may outlive the turn that yielded it; the survey could not establish this. If it does, the idle rule may ignore work that is still running.
- The survey did not establish whether `item_completed` is written when a yielded cell ends, what output represents a long exec that resumed, which output contains the user-aborted marker, or whether `turn_attribution.parent_turn_id` identifies sub-agent rollouts.
- The opencode sub-agent task shape, a live running part, whether `time_updated` changes during a running part, and the meaning of the event table remain undetermined.
- Claude reader false-positive and false-negative rates remain unmeasured.
