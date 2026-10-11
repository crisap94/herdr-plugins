# Proposal: a full lane is compacted even while it waits, and a compaction is queued instead of refused

## Why

Measured on 2026-10-11 at 04:26 UTC with `tab-recap autocompact --all` on one machine running nine long-lived
coordinating lanes: four of them sat at 84 %, 90 %, 92 % and 95 % of their context window, above the ceiling, and every
one was skipped with gate `in-flight`. The details were `awaiting <names>` (the `awaiting` token another tool sets
while a lane waits for a reply) and `N running` (background shells, monitors and background subagents the lane had
started). A lane that coordinates other lanes almost always waits for someone or runs a watcher, so it never passes the
gate however full it gets, and the ceiling, which exists to stop exactly that, never applies.

Two things make the gate stricter than it needs to be. Background work that the harness runs on its own (a Claude Code
background shell, a `Monitor`, a background `Agent`) is expected to keep running across `/compact`, since the session
and the process stay the same and its end notice still arrives; task 0.1 proves it live before anything relies on it.
And an awaited reply still arrives after a compaction as a new prompt; what a compaction loses is only the agent's
memory that it was waiting, which a note can carry.

The same lanes also fail compactions that do start. The flow checks the agent's status when the request is taken and
again after the brief is written, and the brief takes a model call; a coordinating lane is woken constantly (a child's
reply, a watcher's event), so the second check often finds it `working` and the compaction ends `skipped` with a toast,
for automatic and requested compactions alike. The operator saw "cannot compact, not idle" repeatedly. The only good
reason not to type a compaction behind the current turn is that the harness would lose the input or the work; when the
harness queues typed input and runs it after the turn, refusing a working agent protects nothing.

## What changes

- Background work that survives a compaction no longer counts as in flight. Each kind's in-flight reader says which
  work it found is background work; a kind whose reader cannot tell keeps today's rule, by name.
- At or above the ceiling, an awaited reply no longer holds a lane: the lane is compacted, and the automatic compaction
  carries a note naming the awaited names and the running background work, so the agent continues them. Below the
  ceiling nothing changes. Foreground work in flight still holds a lane at any share.
- A compaction (automatic, the operator's, or another tool's request) is queued behind the current turn instead of
  refused when the agent's kind queues typed input: each kind's compaction plan says `queues` or `needs-idle`. Claude
  says `queues` once task 0.2 proves it live; Codex and opencode stay `needs-idle`, by name. A blocked agent is still
  refused, since typing would answer it.
- A queued compaction is confirmed by its own mark in the agent's records, re-read at each settle within the existing
  ten-minute bound, and is never typed twice.
- One toast when a compaction starts and one when it ends; the lane shows `queued behind the current turn` while it
  waits.

## Out of scope

Typing into a blocked agent. Changing the ceiling, the minimum or any style number. Queuing or background work for
Codex and opencode, until a measurement shows how they behave.
