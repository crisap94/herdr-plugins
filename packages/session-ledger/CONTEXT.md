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
| Story | The short paragraph kept for a task by the `Stories` plug (`src/contract/engine.ts`) and read back for the task. A curator answer whose story is null keeps the stored story unchanged: the plug's `keep` is called with `story: null` and must leave what it stores as it was. |

## The root without the unstable entry

The package has three entries: the root, `./compaction-timing` and `./testkit`. The `./unstable/*` entry and the 115 re-export stubs of the host are gone; the host and the package tests reach every name through the root.

| Term | Meaning |
|---|---|
| Root re-export | A named `export { ... } from` line of `src/index.ts`, grouped by source module and never `export *` of an engine module. `test/gates/root-identity.test.ts` holds that each value is the very value of its module |
| Alias after its module | A second name for a declaration that two modules share by name with different meanings: `wordTokensOf`, `wordJaccard`, `anchorQuotedIn`, `similarTokensOf`, `ItemGate`, `RecordedVerdict`, `ContextObserved` and the `Legacy` types (`LegacyEngine`, `LegacyEnginePlugs`, `LegacyFollowedSession`, `LegacySessionReader`, `LegacyStories`, `LegacyWriter`, `LegacyFactStore`, `LegacyRecords`, `LegacyEnumerator`, `LegacyRecapWritten`, `LegacyKeepInput`, `LegacyClock`, `I18nSection`, `I18nSectionId`) whose contract twin keeps the plain name |
| Root copy | A name the contract declares and a legacy module declares again (`ok`, `err`, `unknown`, `isUnknown`, `Text`, `Result`). The host takes the contract's copy, because the two have the same shape and the same brand; `UNREAD` is the one value taken from `ports/transcripts.ts`, because the engine and the host compare positions to that very object |
| Vocabulary baseline of the root | `src/index.ts` holds 2 matches of the host-vocabulary rule: the module paths `recap/domain/lane-shape.ts` (`paneIdOf`, `tabIdOf`, `agentKindOf`) and `recap/application/lane-hints.ts` (`touchedFiles`). The row leaves when the FollowedSession step renames both files |
| Kept for the FollowedSession step | `recap/domain/lane-shape.ts` and `facade/translate.ts` stay byte for byte: the facade, the ports and `recap-input` use them, and removing them means the engine consumes `FollowedSession` directly, which changes behaviour. `Lane` is not exported |
| Private import | A test under `test/` (outside `test/gates/`) imports only public entries, so the package tests import the root, not `#src/`; `test/e2e/root-values.test.ts` names the root values no other e2e test reaches |
