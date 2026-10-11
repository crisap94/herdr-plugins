# R02: a Claude handoff read back through the real transcript reader

Date 2026-10-11. Code: tab-recap at `f4a23bc` on `feat/lane-handoff` (the prompt unwrapping fix is in). Scratch herdr session, scratch state directory, empty plugin configuration directory. Two Claude lanes in separate git repositories; the target had one trivial turn first, so its session id was known before the handoff (the case where the target's own transcript is the evidence). Host load about 30 on 8 cores.

| Step | Result |
|---|---|
| Source lane given one multi-line turn; recap written | 8.9 s after the turn ended |
| `handoff --print --from <source>` | exit 0, 1335 bytes, nothing typed |
| `handoff --from <source> --to <target> --note g8b` | exit 0, "handoff delivered to the target lane"; daemon log `delivered bytes 1364 omitted 0 withheld 0` |
| Target transcript, the stored prompt row | wrapped in `<pasted_content id=...>` tags: 1422 bytes and 37 lines (the sent 1364 bytes and 32 lines, plus 58 bytes and 5 lines of wrapper) |
| Real `ClaudeTranscripts.latestPrompt` on that file | a prompt of 1364 bytes and 32 lines, no wrapper tags: equal to the bytes sent |
| The target afterwards | started working on the brief (tool calls in the transcript) |

Reading: the stored wrapper is exactly what the live proof R01 found, and the reader now returns the text that was sent, so the 400-code-point prefix comparison of the delivery confirmation can match for a Claude target. The delivery confirmation accepts either evidence (transcript or status), so this run shows the reader side live and the matching rule is pinned by the unit tests (`handoff-claude-reader.test.ts`); the run does not by itself show which evidence confirmed the delivery.

Cleanup: daemon and server stopped by recorded process id, scratch session directory and the two Claude project directories removed. No content is stored here; only byte and line counts.
