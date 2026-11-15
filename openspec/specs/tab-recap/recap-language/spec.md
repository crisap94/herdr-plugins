# tab-recap/recap-language Specification

## Purpose
How tab-recap decides the language a recap is written in, keeps every recap of every tab in that language, and says where the
choice came from.

## Requirements

### Requirement: The settings file wins over the environment for the language keys

The interface language (`TAB_RECAP_LOCALE`) and the recap language (`TAB_RECAP_RECAP_LANG`) SHALL be read from the settings file
`config.env`, which the settings modal writes, before the environment; an environment variable SHALL decide one of these keys
only when the settings file does not hold it. Every other key SHALL keep the environment first. The settings modal SHALL NOT
lock the two language rows because an environment variable is set.

#### Scenario: The modal's choice beats the environment

- **WHEN** the environment holds `TAB_RECAP_RECAP_LANG=en` and the settings file holds `TAB_RECAP_RECAP_LANG=es`
- **THEN** the recap language SHALL be `es`

#### Scenario: The environment fills a key the file lacks

- **WHEN** the settings file has no `TAB_RECAP_RECAP_LANG` and the environment holds `TAB_RECAP_RECAP_LANG=es`
- **THEN** the recap language SHALL be `es`

### Requirement: The writer is always told the language

Every instruction to the recap writer, the first call and the correction alike, SHALL name the recap language, English
included.

#### Scenario: English

- **WHEN** the recap language is `en`
- **THEN** the instructions SHALL hold "Write every text and why in English. Keep the JSON keys and the words add, update, close in English."

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

### Requirement: Saving a language change rewrites every recap

When the settings modal saves a change to `TAB_RECAP_LOCALE` or `TAB_RECAP_RECAP_LANG`, it SHALL request a recap of the tab it was
opened from and of every tab that has a stored view and a recap.

#### Scenario: Three tabs

- **WHEN** tabs `w1:t1` and `w1:t2` have a recap, `w1:t3` has a view but no recap, and the language is saved from `w1:t1`
- **THEN** a rewrite SHALL be requested for `w1:t1` and `w1:t2` and not for `w1:t3`

### Requirement: Status names the recap language and its source

`tab-recap status` SHALL print the recap language in force and where it came from: the settings file, an environment variable,
or the system language (`LC_ALL`, then `LC_MESSAGES`, then `LANG`).

#### Scenario: Set in the modal

- **WHEN** the settings file holds `TAB_RECAP_RECAP_LANG=es` and the interface is English
- **THEN** status SHALL print the line `language es (settings file)`
