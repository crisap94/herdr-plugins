## MODIFIED Requirements

### Requirement: The code carries no comments

The `.ts` and `.mjs` files of `tab-recap/src`, `tab-recap/bin` and `tab-recap/test` SHALL contain no comment, except a
shebang line and a directive pragma (`@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`, `oxlint-disable`,
`ast-grep-ignore`, `eslint-disable`, or a `/// <reference` line). The guard `recap-no-comments` SHALL fail the lint gate
when a file holds any other comment. In `tab-recap/src` and `tab-recap/bin`, the pragmas that silence a check
(`@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `oxlint-disable`, `eslint-disable`, `ast-grep-ignore`) SHALL NOT appear either;
the guard `recap-no-suppression` SHALL fail the lint gate when one does.

#### Scenario: A source file contains a comment

- **WHEN** a source file under `tab-recap/src` contains a line comment that is not a directive pragma
- **THEN** the guard `recap-no-comments` SHALL report it and `bash ci/lint.sh` SHALL fail

#### Scenario: A source file contains only a directive pragma

- **WHEN** a source file under `tab-recap/src` contains only a directive pragma that silences nothing, such as `// @ts-check`
- **THEN** the guard `recap-no-comments` SHALL NOT report it and `bash ci/lint.sh` SHALL pass

#### Scenario: A test file contains only a directive pragma

- **WHEN** a test file under `tab-recap/test` contains only a directive pragma such as `// @ts-expect-error`
- **THEN** the guard `recap-no-comments` SHALL NOT report it and `bash ci/lint.sh` SHALL pass

#### Scenario: A source file contains a suppression pragma

- **WHEN** a source file under `tab-recap/src` contains `// @ts-expect-error`
- **THEN** the guard `recap-no-suppression` SHALL report it and `bash ci/lint.sh` SHALL fail

#### Scenario: Released migrations are frozen; new migrations are checked

- **WHEN** a released migration file and a new migration file each contain a comment
- **THEN** the released migration SHALL be exempt because `ci/check-migrations.sh` freezes its bytes, and the new migration SHALL NOT be exempt and the guard `recap-no-comments` SHALL report its comment
