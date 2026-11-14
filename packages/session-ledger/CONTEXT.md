# @stateforge-labs/session-ledger — vocabulary

Context "Session ledger": the engine that reads agent sessions and keeps a written recap per scope. The contract in `src/contract/` uses these terms. Where a term has no own entry here, the vocabulary of [tab-recap/CONTEXT.md](../../tab-recap/CONTEXT.md) applies.

| Term | Meaning |
|---|---|
| Engine | The single entry object |
| Scope | A group of sessions recapped together |
| Followed session | One agent session the host asks the engine to read |
| Session key | The host's stable name for a followed session |
| Session id | The harness's own id; it changes on `/clear` or a restart |
| Turn | A non-queued user entry |
| Fact | One established statement, open or closed |
| Task | A group of followed sessions sharing a workplace |
| Boundary | A compaction mark |
| Chapter | The span between boundaries |
| Recap | The written state of a scope |
| Run | One attempt to write a recap |
| Imported run | A run brought in from an older store by the host (`cause: 'imported'`, `tab-recap/src/ports/recap-records.ts:40,72`) |
| Language | The tag a recap is written in |
| Restore text | The bounded text given back to a session after compaction |
