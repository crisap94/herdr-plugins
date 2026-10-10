## ADDED Requirements

### Requirement: One compaction per lane

A lane SHALL have at most one compaction queued or in progress at a time, whatever asked for it: the operator,
autocompact, or another tool's `compact-req-<tool>` token. A request for a lane whose compaction is queued or in
progress SHALL join that compaction: it SHALL start no compaction and SHALL NOT type anything. A joined request from
another tool SHALL be answered `queued` at once and then with the running compaction's stages and outcome. The
operator SHALL be told that the request joins the compaction, and, when the request carried a note, that the note is
not used. An automatic request that joins SHALL NOT be announced. The lane SHALL be released when its compaction is
done, failed, refused or throws, so the next request on it starts its own compaction. The check and the claim of the
lane SHALL be made in one step, after the last wait before the flow starts, so two requests for one lane at the same
instant cannot both start a compaction.

#### Scenario: A request and an automatic one at the same instant

- **WHEN** another tool's request and an automatic compaction for the same pane are taken in the same second
- **THEN** one compaction SHALL start, one `/compact` SHALL be typed, one compaction record SHALL be written, and the
  request SHALL be answered `queued`, then with the running compaction's stages and its outcome

#### Scenario: A joined request for a refused agent

- **WHEN** a request joins a compaction and the agent is working, so the running compaction is refused
- **THEN** the joined request SHALL be answered with the same refusal the running compaction gets, and nothing SHALL be typed

#### Scenario: A flow that throws

- **WHEN** the running compaction of a lane throws, with a request joined to it
- **THEN** the running request and the joined one SHALL be answered `failed-error`, and the lane SHALL be released so the next request compacts

#### Scenario: A daemon restart while a request is joined

- **WHEN** the daemon restarts while a joined request waits for the running compaction
- **THEN** the joined request is not answered again by this daemon and keeps the answer `queued` until its token expires; the running compaction is answered `failed-interrupted` as before
