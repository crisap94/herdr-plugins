## MODIFIED Requirements

### Requirement: Old facts are rewritten until none is left in the old language

While any open fact of a tab's ledger is stored with a language other than the recap language, every writer call for that tab
SHALL ask to rewrite the open facts from that language into the recap language, and a requested or turn-ended run for that tab SHALL call the writer even
when the recap is already stamped in the recap language and no new transcript content arrived; a focused run with no new transcript content SHALL NOT call the writer for this reason alone. A fact SHALL take the recap
language when the writer adds or updates it and the operation passes the gates.

#### Scenario: A fact the switch left behind

- **WHEN** the recap language moved from `en` to `es`, the switch run is stored, and open fact `f1` is still stored as `en`
- **THEN** the next writer call SHALL carry the line to rewrite the facts from English into Spanish

#### Scenario: A recap stamped es with an open fact in en and no new transcript

- **GIVEN** a recap stamped `es` with an open fact `f1` stored as `en` and no new transcript
- **WHEN** a rewrite is requested
- **THEN** the writer SHALL run with the rewrite line, and a following focus with no new transcript SHALL NOT call the writer

#### Scenario: Nothing left in the old language

- **WHEN** every open fact is stored as `es` and the recap language is `es`
- **THEN** the writer call SHALL carry no rewrite line
