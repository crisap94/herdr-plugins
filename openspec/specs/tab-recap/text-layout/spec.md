# tab-recap/text-layout Specification

## Purpose
How tab-recap measures, wraps and colours text for a narrow terminal pane.

## Requirements

### Requirement: Text width is measured in terminal cells

Every line tab-recap draws in a column, modal, bar or setup screen SHALL be measured in terminal cells:
terminal escape sequences take no cells, an emoji drawn with emoji presentation takes two cells, a
combining mark takes none, and every other character takes one.

#### Scenario: Escape sequences take no room

- **WHEN** a line contains colour escape sequences around the word `recap`
- **THEN** its measured width SHALL be 5

#### Scenario: Emoji take two cells

- **WHEN** the text `📝✅` is measured
- **THEN** its width SHALL be 4

#### Scenario: A joined emoji and an accented letter

- **WHEN** the text `👩‍💻é` is measured, with `é` written as `e` plus a combining acute accent
- **THEN** its width SHALL be 3

### Requirement: Wrapped lines fit the pane

A wrapped line SHALL never be wider than the width it was wrapped to, so no line overflows the column.

#### Scenario: Emoji near the edge move to the next line

- **WHEN** the text `xxxxxxx 📝📝📝` is wrapped to a width of 8 cells
- **THEN** every resulting line SHALL measure at most 8 cells

### Requirement: A cut never splits a character

When a word longer than the available width is cut across lines, the cut SHALL fall between
user-perceived characters, never inside one: no line SHALL contain half of a surrogate pair, half of a
joined emoji or a letter separated from its combining accent.

#### Scenario: Long word made of emoji

- **WHEN** the word `xxxxxxx📝📝📝` is wrapped to a width of 8 cells
- **THEN** every resulting line SHALL be valid text that contains only whole characters
- **AND** joining the lines without the continuation indent SHALL give back the original word

#### Scenario: Long word with combining accents

- **WHEN** a word of twenty `é` written as `e` plus a combining accent is wrapped to 8 cells
- **THEN** no line SHALL start with a combining accent

### Requirement: Colour follows the terminal's wishes

A column, modal or setup screen SHALL print no colour or style escape sequences when its terminal asks
for none (`NO_COLOR` set, `FORCE_COLOR=0`, `NODE_DISABLE_COLORS` set, or output that is not a colour
terminal), and SHALL print them otherwise.

#### Scenario: NO_COLOR is set

- **WHEN** a column starts with `NO_COLOR=1` in its environment
- **THEN** nothing it prints SHALL contain a colour or style escape sequence
- **AND** its text and layout SHALL be the same as with colour

#### Scenario: A colour terminal

- **WHEN** a column starts on a colour terminal without any of those variables
- **THEN** headings and meta lines SHALL be printed with their colours and styles as today
