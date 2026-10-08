## MODIFIED Requirements

### Requirement: The operator triggers compaction

Compaction SHALL start from the operator's action (bindable action or the `c` key), for the tab's focused
agent by default, or for all agents or chosen kinds when configured. Apart from the operator, it SHALL start
only from autocompact when `TAB_RECAP_AUTOCOMPACT` is `on`. Both SHALL go through the same request path and
the same compaction flow.

#### Scenario: Focused agent

- **WHEN** the operator triggers compaction in a tab with two agents and the focus is on one of them
- **THEN** only that agent SHALL be compacted

#### Scenario: Never on its own while autocompact is not on

- **WHEN** `TAB_RECAP_AUTOCOMPACT` is `off` or `shadow` and an agent's context passes every threshold
- **THEN** no compaction SHALL start until the operator asks

### Requirement: Compaction is suggested, not forced

A lane whose context use reaches the configured share of its full context window (40 % by default) SHALL
show a short hint with the percentage. The hint SHALL never trigger compaction by itself; automatic
compaction is the separate autocompact setting. The context use SHALL follow an agent's own compaction: once
the agent's records show a compaction with the tokens left after it, that count SHALL be the lane's context
use until a newer usage record arrives.

#### Scenario: Window from the agent's own data

- **WHEN** a Codex rollout states its model context window, or the model is in the local catalogue
- **THEN** that window SHALL be used and the hint SHALL say which size it measured against

#### Scenario: Codex near its window

- **WHEN** a Codex lane's last token count is 45 % of its model context window and the threshold is the default
- **THEN** its header SHALL show the hint with 45 %

#### Scenario: Claude compacted itself

- **WHEN** a Claude transcript's last usage row says 431 387 tokens of a 1 000 000 window, and a later
  compaction record says 12 332 tokens after it
- **THEN** the lane's context use SHALL be 12 332 tokens (1 %) and no hint SHALL show at the default threshold

## ADDED Requirements

### Requirement: A compaction says who started it

Every compaction record SHALL store its origin, `operator` or `auto`. The notification that a compaction
started SHALL name the agent and, for an automatic one, say `(auto)`. The expanded view's session facts
SHALL count compactions by origin.

#### Scenario: An automatic compaction

- **WHEN** autocompact requests a compaction of a Claude agent
- **THEN** the record's origin SHALL be `auto` and the notification SHALL read like `Compacting claude (auto)`

#### Scenario: The operator's compaction

- **WHEN** the operator presses `c` in a column
- **THEN** the record's origin SHALL be `operator`
