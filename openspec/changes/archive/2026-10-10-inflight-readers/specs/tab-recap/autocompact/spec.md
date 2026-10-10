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
