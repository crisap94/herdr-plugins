# R04: the handoff exchange on a real herdr

Date 2026-10-11. Code: tab-recap on `feat/lane-handoff-exchange` (the descriptor, the responder and the mirror). herdr 0.9.3. A scratch herdr session, a scratch state directory, an empty plugin configuration directory, sharing on (`TAB_RECAP_HERDR_EVENTS=on`). Two Claude lanes in throwaway directories: a source lane with one substantive turn (one recap run recorded) and an idle target lane. A second shell wrote the request with `herdr pane report-metadata <source pane> --source <tool> --token handoff-req-<tool>=<id>:<workspace>:<pane>`.

| Step | Setting | Result |
|---|---|---|
| Request `h1` naming the idle target lane (`w1:p3` as workspace `w1`, pane `p3`) on the source pane | `TAB_RECAP_HANDOFF_REQUESTS=on` | answers seen on `tab-recap-handoff`, sampled every 0.3 s: `h1:queued`, `h1:running`, `h1:delivered`, in 14 s |
| Ask ledger and answers after the request | on | one `handoff` ask, one handoff answer with the outcome `delivered` |
| Events | on | `tab-recap-event` carried `handoff-delivered:h1` on the source pane and on the target pane (the token holds the newest event) |
| The same request `h1` written again | on | nothing new: still one delivered answer |
| Request `h2` naming the same target after a restart with the setting off | off, sharing on | `h2:refused-not-offered`, no request row written |
| Request `h3` naming a pane in another workspace, setting still off | off | `h3:refused-not-offered` (the setting is checked first) |

The pane identifier format seen is `w<n>:p<n>`; the request carries the workspace and the pane as two words. The refusals `refused-bad-request`, `refused-not-a-lane` and `refused-target-elsewhere` with the setting on, and the `failed-expired` and `failed-interrupted` mappings, are covered by the tests of the responder and the mirror, not by this run.

Cleanup: the daemon and the server were stopped by recorded process id, and the scratch session directory and the throwaway Claude project directories were removed. No content is stored here; only counts, stage names and identifiers of the scratch session.
