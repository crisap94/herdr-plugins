# R03: retained closed lanes on a real herdr

Date 2026-10-11. Code: tab-recap on `feat/lane-handoff-retention` after the closed-lane groups 1 to 5 (the closure fold, migration 019, the ClosedLanes store, the resolver, `--list-closed` and `--from-closed`). herdr 0.9.3. A scratch herdr session, a scratch state directory, an empty plugin configuration directory, the default closed-lane window of 14 days. Three Claude lanes, each in its own throwaway directory.

| Step | Result |
|---|---|
| Close a pane, then split the same tab again | the closed pane was `w1:p2`, the next pane got `w1:p3`: **herdr 0.9.3 does not reuse pane identifiers** |
| Source lane given a substantive turn while the daemon ran | one recap run recorded; the lane row persisted with a non-null `since` |
| Close the source lane's pane | exactly one `closed_lane` row for that tab and pane, agent `claude`, a stored working directory, a close instant; the closure resolved to a task through the recap run |
| `handoff --list-closed --tab <tab>` | exit 0, one line of four tab-separated fields, nothing on stderr |
| `handoff --from-closed <pane> --tab <tab> --closed-at <instant> --to <target>` | exit 0, "handoff delivered to the target lane", 13 s |
| `handoff --print --from-closed ...` | exit 0, 1088 bytes, one line mentioning the close |
| A second lane persisted, the daemon stopped, its pane closed, the daemon started again | one `closed_lane` row for that lane (a restart closure), listed by `--list-closed` |
| `--list-closed` and `--print --from-closed` against the live store | closure and request row counts unchanged |

Two earlier attempts of the script failed for reasons of the script, not the product: herdr accepts only lowercase agent names, and a lane whose turn ended before the daemon started has no recap run, so its closure has no task and resolves to `never-seen` (the specified behaviour: a closure with no run).

Cleanup: the daemon and the server were stopped by recorded process id, and the scratch session directory and the throwaway Claude project directories were removed. No content is stored here; only counts, sizes and identifiers of the scratch session.
