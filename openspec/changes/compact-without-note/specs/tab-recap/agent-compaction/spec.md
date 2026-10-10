## MODIFIED Requirements

### Requirement: An optional focus note

Before sending, a popup SHALL ask for an optional note, unless `TAB_RECAP_COMPACT_NOTE` is `skip` or the
compaction is requested with `tab-recap compact --note "<text>"`. A note SHALL become the first priority of the
message; Enter on an empty note SHALL send without any trace of it; Esc SHALL cancel without sending. With
`skip`, the compaction SHALL be queued at once with no note and no popup. A `--note` SHALL queue it at once with
that note, whatever the setting says, and open no popup; `--note ""` SHALL queue it with no note. Both SHALL
queue the request the popup sends. A note given on the command line SHALL be kept as the popup keeps one: one
line, trimmed, at most 280 characters. `TAB_RECAP_COMPACT_NOTE` is `ask` when unset or set to anything other
than `skip`, and it SHALL be read on every use, without a restart.

#### Scenario: Skipped note

- **WHEN** the operator presses Enter without typing
- **THEN** the message SHALL contain no note line

#### Scenario: Cancel

- **WHEN** the operator presses Esc
- **THEN** nothing SHALL be sent to any agent

#### Scenario: The setting skips the popup

- **WHEN** `TAB_RECAP_COMPACT_NOTE` is `skip` and the operator triggers compaction, by the command or by `c` in a column
- **THEN** no popup SHALL open and the request SHALL be queued with no note, for the same tab and pane the popup would use

#### Scenario: The default asks

- **WHEN** `TAB_RECAP_COMPACT_NOTE` is unset, or set to any value other than `skip`, and the operator triggers compaction
- **THEN** the popup SHALL open as before

#### Scenario: A note on the command line

- **WHEN** the operator runs `tab-recap compact --note "keep the tests"` with `TAB_RECAP_COMPACT_NOTE` set to `ask`
- **THEN** no popup SHALL open and the request SHALL be queued with the note `keep the tests`

#### Scenario: An empty note on the command line

- **WHEN** the operator runs `tab-recap compact --note ""`
- **THEN** no popup SHALL open and the request SHALL be queued with no note

#### Scenario: The note on the command line is cut as the popup cuts it

- **WHEN** the `--note` text is longer than 280 characters or spans several lines
- **THEN** it SHALL be queued as one line, trimmed, at most 280 characters

#### Scenario: The settings row

- **WHEN** the operator changes the "Compact note" row in the settings
- **THEN** `TAB_RECAP_COMPACT_NOTE` SHALL be written with the chosen value, and a row whose variable is set in the environment SHALL be read-only
