# Proposal

## Why

The recap writer is not given what a recap needs. A measured live call used 7 356 tokens for about
2 000 tokens of our context: the Codex writer ignores the configured low reasoning effort (its user
config is skipped) and loads agent features a recap never uses. The context itself has no times, cuts
the end of long answers, gives one-agent tabs no orientation, drops prompts typed while the agent was
busy, ignores the agent's own summaries, turns Codex tool calls into unreadable JavaScript, and lets an
invented fact in the previous recap survive every rewrite. Its plain-text markers collide with the
markdown and JSON inside agent replies.

## What Changes

- The writer receives one XML document, `recap_input`, defined by a DTD shipped in the repository
  (`tab-recap/schema/recap-input.dtd`): the tab and its agents (folder, repository, branch, recently
  edited files), the previous recap, the agents' own notes, and per agent the new turns and tool calls
  with their times. Instructions stay plain text; the answer stays the same JSON.
- Turn texts keep their beginning and end; prompts typed while the agent was busy are included; noise
  lines are left out; plain file reads are counted instead of listed; Codex tool calls are decoded.
- The instructions tell the writer to drop a previous item the transcript contradicts.
- The writer runs at a configurable effort, `low` by default, and Codex without the agent features a
  recap never uses.
- **BREAKING (runtime):** Node 24.21.0 or later is required; no launch needs a warning flag any more.

Out of scope: compaction boundaries, chapters, the whole-session view and retention (history release);
any change to the seven sections, their caps or the JSON answer.

Delivered in two merge requests, both `changelog::changed`: (1) Node 24.21 and the lean writer at low
effort; (2) the XML context, which archives this change.

## Capabilities

### New Capabilities

- `tab-recap/writer-context`: what the recap writer receives for one tab and one run, and how the
  writer is run.

### Modified Capabilities

- `tab-recap/state-store`: the supported Node versions requirement moves to 24.21.0.

## Impact

`tab-recap/src/ports/{transcripts,summarizer}.ts`, the claude/codex/opencode readers, a new tool-call
adapter, `src/recap/application/{xml,writer-context,recap-job,lane-hints}.ts`,
`src/adapters/recap-prompt.ts`, every summarizer adapter, `daemon/config.ts` + setup rows (effort),
`host-check.ts`, the manifest, `bin/tab-recap.ts`, CI floor jobs (GitHub + GitLab, xmllint in GitLab
test jobs), docs. No runtime dependency is added.
