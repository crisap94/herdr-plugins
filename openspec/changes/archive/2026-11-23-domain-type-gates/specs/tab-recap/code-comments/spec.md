## MODIFIED Requirements

### Requirement: The code carries no comments

The `.ts` and `.mjs` files of `tab-recap/src`, `tab-recap/bin` and `tab-recap/test` SHALL contain no comment, except a shebang
line and a directive pragma. The guard `recap-no-comments` SHALL fail the lint gate when a file holds any other comment.

#### Scenario: A source file contains a comment

- **WHEN** a source file under `tab-recap/src` contains a line comment that is not a directive pragma
- **THEN** the guard `recap-no-comments` SHALL report it and `bash ci/lint.sh` SHALL fail

#### Scenario: A source file contains only a directive pragma

- **WHEN** a source file under `tab-recap/src` contains only a directive pragma that silences nothing: `@ts-check` or a `/// <reference` line
- **THEN** the guard `recap-no-comments` SHALL NOT report it and `bash ci/lint.sh` SHALL pass

#### Scenario: A test file contains only a directive pragma

- **WHEN** a test file under `tab-recap/test` contains only a directive pragma, one of `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`, `oxlint-disable`, `ast-grep-ignore` or `eslint-disable`
- **THEN** the guard `recap-no-comments` SHALL NOT report it and `bash ci/lint.sh` SHALL pass

#### Scenario: Released migrations are frozen; new migrations are checked

- **WHEN** a released migration file and a new migration file each contain a comment
- **THEN** the released migration SHALL be exempt because `ci/check-migrations.sh` freezes its bytes, and the new migration SHALL NOT be exempt and the guard `recap-no-comments` SHALL report its comment

## ADDED Requirements

### Requirement: No pragma silences a check

In `tab-recap/src` and `tab-recap/bin`, no pragma that silences a check SHALL appear: `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`,
`oxlint-disable`, `eslint-disable` or `ast-grep-ignore`. The guard `recap-no-suppression` SHALL fail the lint gate when one does.

#### Scenario: A source file contains a suppression pragma

- **WHEN** a source file under `tab-recap/src` contains `// @ts-expect-error`
- **THEN** the guard `recap-no-suppression` SHALL report it and `bash ci/lint.sh` SHALL fail
