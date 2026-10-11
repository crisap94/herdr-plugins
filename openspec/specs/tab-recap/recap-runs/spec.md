# tab-recap/recap-runs Specification

## Purpose
When a tab's recap is written: one run per tab at a time, what starts a run at once, and how turn endings that arrive close
together are merged into one run. The writer's content is specified in `fact-ledger` and `writer-context`.

## Requirements

### Requirement: Turn endings inside a window merge into one run per tab

Each tab SHALL have at most one recap run in progress, as today. When a turn ending asks for a run, the run SHALL start
after the settle delay, unless the last run of the tab that called the writer started less than `TAB_RECAP_RUN_DEBOUNCE_MS`
before. In that case the run SHALL start at the later of two times: the deadline, which is that run's start plus the
window, and the last turn ending plus the settle delay. Turn endings that arrive before the run starts SHALL join it, and
the run SHALL read every turn they bring through the transcript cursor.

`TAB_RECAP_RUN_DEBOUNCE_MS` SHALL be `0` by default, which is no window. Its accepted values are `0` and the whole numbers
of milliseconds from 5 000 to 300 000; any other value, including a non-integer such as 5000.5, SHALL fall back to `0`. It SHALL be read on every request, so a change applies without a
restart.

#### Scenario: Endings after a run merge into the next one

- **WHEN** the window is 60 000 ms, the tab's last run started at second 0, and turn endings of that tab arrive at seconds
  20, 30 and 45
- **THEN** no run of that tab SHALL start before second 60, and the run at second 60 SHALL read the turns of all three endings

#### Scenario: A turn ending near the deadline waits the settle delay

- **WHEN** the window is 60 000 ms, the tab's last run started at second 0, and a turn ends at second 59.0
- **THEN** the run SHALL start at second 61.5, the ending plus the settle delay, not at the deadline of second 60

#### Scenario: Nothing is lost by the merge

- **WHEN** three turns of one lane end inside one window
- **THEN** the run at the deadline SHALL read all three through the cursor, and the cursor SHALL then sit after the third

#### Scenario: A turn ending while a run is in progress

- **WHEN** a run of a tab is in progress, a turn ending of that tab arrives, and the window's deadline is already past
- **THEN** the turn ending SHALL be kept as the tab's next run, SHALL start when the run in progress ends, and SHALL NOT start
  before the settle delay after its own ending

#### Scenario: No window

- **WHEN** `TAB_RECAP_RUN_DEBOUNCE_MS` is 0 and two turn endings arrive twenty seconds apart
- **THEN** each SHALL start its own run after the settle delay, as today

#### Scenario: An invalid window

- **WHEN** `TAB_RECAP_RUN_DEBOUNCE_MS` is 4 999, or 5 000.5
- **THEN** the window SHALL be 0 in each case

### Requirement: Runs that another flow or the operator asked for start at once

A run asked for by the operator's focus, by a refresh another flow is waiting for (autocompact's refresh, a compaction's
refresh, an operator's request), for the first run of a tab in this daemon process, or for a run whose set of lanes differs
from the lanes of the tab's last run that called the writer SHALL start at once, whatever the window, unless a run of that
tab is in progress. In that case it SHALL run as soon as that run ends, and never at a window's deadline. A run that calls
the writer SHALL set the tab's last run start and lanes, so the next turn ending is measured from it.

#### Scenario: A refresh inside a window

- **WHEN** a turn ending of a tab is waiting for a window's deadline 40 seconds away, and autocompact asks for a refresh of
  the same tab
- **THEN** the refresh SHALL start at once and SHALL read the pending turn through the cursor, so the pending turn ending SHALL
  NOT start a run of its own; a turn ending after the refresh's start SHALL wait for the window measured from the refresh's start

#### Scenario: A refresh behind a run in progress

- **WHEN** a run of a tab is in progress and a refresh of that tab is asked for
- **THEN** the refresh SHALL run as soon as the run in progress ends, not at a window's deadline, and the caller waiting for
  the refresh SHALL be resolved after it

#### Scenario: A forced request keeps its cause over a turn ending while a window is on

- **WHEN** the window is on, a run is in progress, a `requested` request is kept as the tab's next run, and a turn ending of
  that tab arrives before the run in progress ends
- **THEN** the next run SHALL still be the `requested` one, SHALL start as soon as the run in progress ends, and SHALL read the
  turn that ended through the cursor; the turn ending SHALL NOT replace it and SHALL NOT wait for a window
- **AND** with the window at 0 a later request SHALL replace the pending one, as today

#### Scenario: A changed lane set inside a window

- **WHEN** a turn ending of a tab arrives inside a window and its lane set differs from the lanes of the tab's last run that
  called the writer
- **THEN** the run SHALL start at once and set the tab's last run start and lanes

#### Scenario: The first run after a restart

- **WHEN** the daemon restarts and a turn ending of a tab arrives within the window of that tab's last run before the restart
- **THEN** the run SHALL start at once, because the tab has no run in this process
