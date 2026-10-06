# tab-recap/relative-time Specification

## Purpose
How tab-recap shows elapsed time in the operator's interface language.

## Requirements

### Requirement: Elapsed time is shown in the operator's language

How long ago something happened SHALL be shown in the operator's interface language (English or
Spanish) in a short form, using seconds under a minute, minutes under an hour, hours under a day and
days beyond, always rounded down to a whole number and always in the past.

#### Scenario: English

- **WHEN** 12 seconds, 5 minutes, 3 hours and 2 days have elapsed and the interface language is English
- **THEN** they SHALL read `12s ago`, `5m ago`, `3h ago` and `2d ago`

#### Scenario: Spanish

- **WHEN** the same times have elapsed and the interface language is Spanish
- **THEN** they SHALL read `hace 12 s`, `hace 5 min`, `hace 3 h` and `hace 2 d`

#### Scenario: Nothing has elapsed

- **WHEN** zero seconds have elapsed
- **THEN** it SHALL read `0s ago` in English and `hace 0 s` in Spanish, never a future form such as `in 0s`

#### Scenario: Clock skew

- **WHEN** the event's time is later than now
- **THEN** it SHALL be shown as zero seconds ago
