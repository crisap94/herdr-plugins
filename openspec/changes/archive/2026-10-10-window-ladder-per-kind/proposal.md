## Why

The shared Claude-sized ladder can report Codex, OpenCode, and unregistered lanes as emptier than their observed token peaks. Each adapter's window source needs to decide whether it can round that peak up.

## What Changes

The size ladder becomes part of an adapter's window source. Claude retains the 200k/1M ladder; Codex, OpenCode, and unregistered kinds use the exact observed peak when it exceeds their stated or catalogued window. This changes context-use numbers and autocompact shares, so the merge request carries `changelog::fixed`.

Out of scope: changing the Claude ladder or its values, changing compaction sending, moving context readers, or removing Claude's catalogue lookup.
