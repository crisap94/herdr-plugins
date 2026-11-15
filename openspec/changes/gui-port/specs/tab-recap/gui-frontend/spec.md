## ADDED Requirements

### Requirement: The GUI frontend reads the fleet from herdr-core only

The `gui` frontend SHALL build its fleet snapshot and its change frames from `hc` (terminal list, terminal get, events) and SHALL
NOT open the TUI socket. A lane is one terminal that reports an agent; its tab is the terminal's `herdr.space` and
`herdr.tab` labels.

#### Scenario: a working agent appears
- **WHEN** a terminal reports `status.state = working` under a labelled tab
- **THEN** the daemon starts a lane for that tab and its recap is written like in the TUI frontend

#### Scenario: herdr-core is unreachable
- **WHEN** `hc` cannot be run or answers an error
- **THEN** the frontend reports `unreachable` through the existing unknowable result and keeps the last recap

### Requirement: The recap is shown in an overlay, not a column

The mod SHALL show a tab's recap in an overlay opened by `mod.open` (a key) and by a chip button, and SHALL mark a lane that
needs the operator with the app's status colour. It SHALL NOT split a pane, SHALL NOT post its own toast and SHALL NOT change a
shipped layout.

#### Scenario: open by key
- **WHEN** the operator presses the bound key on a tab with an agent
- **THEN** the overlay shows that tab's seven sections and closes with Esc

#### Scenario: needs you
- **WHEN** a lane's status is blocked
- **THEN** the chip and the overlay show the blocked colour and no toast or layout change is made

### Requirement: The GUI frontend opens no column

The GUI frontend SHALL start with every column hidden (the board's `allHidden` state) and SHALL NOT open, resize or close a pane.

#### Scenario: an agent appears
- **WHEN** a lane is detected
- **THEN** its recap is written and no pane is opened

### Requirement: The mod reads state, never the store

The mod SHALL get recaps only from `tab-recap show --json <tab>` or from the per-tab state file, each under 1 MiB, and
SHALL refresh when the state folder changes.

#### Scenario: a recap is rewritten
- **WHEN** the daemon writes a new recap for a tab
- **THEN** an open overlay shows it without being reopened

### Requirement: The TUI frontend is unchanged

Adding the GUI frontend SHALL NOT change any TUI behaviour, manifest entry or test result.

#### Scenario: the TUI suite
- **WHEN** the plugin gates run after the change
- **THEN** every test that passed before passes with the same assertions
