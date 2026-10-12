## ADDED Requirements

### Requirement: A handoff request seen while sharing is off is remembered

While `TAB_RECAP_HERDR_EVENTS` is `off`, tab-recap SHALL ignore a `handoff-req-<tool>` request as it ignores `compact-req-<tool>`: it SHALL write no answer and queue no row, and it SHALL remember the request's id for that tool, so that a request seen while sharing was off is never acted on, also after sharing is turned on and across restarts. A request with an id not yet remembered SHALL be handled as usual once sharing is on.

#### Scenario: Sharing is turned on after a request was ignored

- **WHEN** `handoff-req-coordinator` = `h1:w2:p7` is on a lane's pane while sharing is off, and sharing is then turned on with the token unchanged
- **THEN** tab-recap SHALL queue nothing and SHALL write no answer for `h1`

#### Scenario: A new id after sharing is turned on

- **WHEN** the same tool then writes `h2:w2:p7` and the handoff setting is on
- **THEN** tab-recap SHALL queue one `handoff` row and answer `h2:queued`
