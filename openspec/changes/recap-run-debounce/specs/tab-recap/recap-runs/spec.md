## Purpose

When a tab's recap is written: one run per tab at a time, what starts a run at once, and how turn endings that arrive close
together are merged into one run. The writer's content is specified in `fact-ledger` and `writer-context`.

## ADDED Requirements

### Requirement: Turn endings inside a window merge into one run per tab

Each tab SHALL have at most one recap run in progress, as today. When a turn ending asks for a run, the run SHALL start
after the settle delay, unless the tab's previous run started less than `TAB_RECAP_RUN_DEBOUNCE_MS` before. In that case
the run SHALL start at the deadline, the previous run's start plus the window. Turn endings that arrive before the deadline
SHALL join the same run, and the run SHALL read every turn they bring through the transcript cursor.

`TAB_RECAP_RUN_DEBOUNCE_MS` SHALL be `0` by default, which is no window. Its accepted values are `0` and 5 000 to 300 000
milliseconds; any other value SHALL fall back to `0`. It SHALL be read on every request, so a change applies without a
restart.

#### Scenario: Endings after a run merge into the next one

- **WHEN** the window is 60 000 ms, a turn ending of one tab starts a run after the settle delay at second 2.5, and two more
  turn endings of that tab arrive at seconds 20 and 30
- **THEN** the run at second 2.5 SHALL be the only run before the deadline at second 62.5, and the run at the deadline SHALL
  read the turns of both later endings

#### Scenario: Nothing is lost by the merge

- **WHEN** three turns of one lane end inside one window
- **THEN** the run at the deadline SHALL read all three through the cursor, and the cursor SHALL then sit after the third

#### Scenario: No window

- **WHEN** `TAB_RECAP_RUN_DEBOUNCE_MS` is 0 and two turn endings arrive twenty seconds apart
- **THEN** each SHALL start its own run after the settle delay, as today

#### Scenario: An invalid window

- **WHEN** `TAB_RECAP_RUN_DEBOUNCE_MS` is 12 000
- **THEN** the window SHALL be 0

### Requirement: Runs that another flow or the operator asked for start at once

A run asked for by the operator's focus, by a refresh another flow is waiting for (autocompact's refresh, a compaction's
refresh, an operator's request), for the first run of a tab in this daemon process, or for a run whose set of lanes differs
from the tab's last run SHALL start at once, whatever the window. Such a run SHALL set the tab's last run start, so the next
turn ending is measured from it.

#### Scenario: A refresh inside a window

- **WHEN** a turn ending was debounced to a deadline 40 seconds away, and autocompact asks for a refresh of the same tab
- **THEN** the refresh SHALL start at once, and the turn ending SHALL start its run at the deadline measured from the
  refresh's start

#### Scenario: A changed lane set inside a window

- **WHEN** a turn ending of a tab arrives inside a window and its lane set differs from the tab's last run's
- **THEN** the run SHALL start at once and set the tab's last run start

#### Scenario: A run in progress keeps its queue

- **WHEN** a run is in progress and a turn ending arrives
- **THEN** the turn ending SHALL be kept as the tab's next run, as today, and it SHALL start after the current run ends, not
  before the window's deadline

#### Scenario: The first run after a restart

- **WHEN** the daemon restarts and a turn ending of a tab arrives within the window of that tab's last run before the restart
- **THEN** the run SHALL start at once, because the tab has no run in this process
