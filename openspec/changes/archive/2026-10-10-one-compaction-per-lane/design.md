# Design

## 1. The claim is in process, and it is taken after the last wait

`CompactionClaims` (`src/recap/application/compaction-claims.ts`) is one object per daemon, shared by the compaction
flow and autocompact. It maps a pane to the requests that joined its running compaction. `claim(pane)` returns
false when the pane is already held, and it is called synchronously, after the last `await` before the flow starts
(the focused pane is read first, so the check happens after it).

The compaction record cannot be the guard: it is written only when the flow begins, after the status read and the
recap refresh (up to 90 seconds). A guard that waits for the record is the bug. A database lock would also miss the
window, since the record is still not written. The claim covers the whole span from the first step to the release.

## 2. A request for a held pane joins it

`Compaction.run` splits each target lane into owned and joined:

- owned lanes run the flow and release the claim in a `finally`, so a failure never leaves a pane held;
- a joined lane records the request with `CompactionClaims.join`, answers it `queued` when it came from another tool,
  and tells the operator `already compacting: this request joins that compaction`.

Answers for a pane go to the owner's request and to every joined request (`answer` fans out). The joined request
therefore sees the running compaction's `running` and its outcome (`done`, or `failed-<reason>`) without a record of
its own. A refused owner (a working agent, for example) passes its refusal to the joined requests too.

## 3. Autocompact reads the same claim, and the queue

`busyOf` (the gate's busy read) gains two reads, both already in the flow's world:

- `claims.has(pane)`: a compaction of the lane is queued or in progress in this daemon, of any origin;
- `queue.compactQueued(tab, pane)`: a compaction request for the lane is in the `request` table and not yet taken.
  A request with no pane is the tab's focused pane and counts for every pane of its tab. This covers the second
  between a request being written and the poll taking it, which the claim does not yet cover.

The queue read is one `SELECT … LIMIT 1` on the `request` table, in `RequestsRepository`, behind the new
`CompactionQueue` port. No Node built-in is involved; nothing is added to `package.json`.

A tool request that the daemon will not run (the herdr events setting is off) is counted as queued until
`takeAnswered` removes it. For that moment the lane reads as busy: conservative and brief, so it is left as it is.

## 4. Why no restart guarantee for joined requests

A joined request exists only in memory: it was taken from the queue, and the running compaction's record does not
carry its answer id (the `answer` column holds one id, the owner's). Making joined requests survive a restart would
mean a new table or a second answer column. That is a larger change, so it is left for a later one and written down
as a limit in the spec and the README.
