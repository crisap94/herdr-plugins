## Why

The context-window domain contains Claude model-family knowledge. Moving that knowledge to adapters lets each registered kind state how its models' context windows are found while preserving shared context-use rules.

## What Changes

Each registered kind supplies a context-window function. The domain applies setting priority and observed-usage raising without knowing model families. The change carries the `changelog::internal` label because it preserves existing behavior.

Out of scope: changing context-window values, changing compaction sending, moving context readers, or removing the Claude catalogue lookup.
