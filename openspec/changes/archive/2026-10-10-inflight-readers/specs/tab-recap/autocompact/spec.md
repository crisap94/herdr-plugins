## ADDED Requirements

### Requirement: Shadow kinds record decisions without requesting compaction

`TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS` SHALL parse to registered transcript kinds and default to empty. A listed kind SHALL run the full autocompact gates and decision process with mode `shadow`, even when the global mode is `on`. Its decision SHALL be visible in `tab-recap autocompact`, and the sweep SHALL never request compaction for it. The default autocompact kinds SHALL remain Claude only.

#### Scenario: Codex is listed for shadow

- **WHEN** Codex is listed in `TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS` while global autocompact is on
- **THEN** the full decision SHALL be recorded with mode `shadow`
- **AND** no compaction request SHALL be queued

#### Scenario: Shadow kinds are unset

- **WHEN** `TAB_RECAP_AUTOCOMPACT_SHADOW_KINDS` is unset or empty
- **THEN** no kind SHALL be explicitly forced to shadow by that setting
- **AND** the default autocompact kinds SHALL remain Claude

### Requirement: Idle transcript work is treated as stale

When herdr reports a lane as idle or done and its transcript reports positive in-flight work, autocompact SHALL treat that work as stale, log a reason beginning `stale:`, and continue the decision without blocking on the transcript count. Existing busy and queued-compaction gates SHALL continue to stop the lane.

#### Scenario: An idle lane has open transcript work

- **WHEN** an idle or done lane's transcript reports one or more open calls or tool parts
- **THEN** autocompact SHALL log a stale reason and continue through the remaining gates

#### Scenario: A compaction is already active

- **WHEN** a lane has an active or queued compaction
- **THEN** the busy gate SHALL stop it before considering in-flight work
