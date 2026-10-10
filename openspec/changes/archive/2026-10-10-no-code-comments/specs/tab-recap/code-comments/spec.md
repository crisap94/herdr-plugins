## Purpose

The plugin's source carries no comments: meaning lives in names, types, small functions and tests, and rationale lives in
the documents that own it. A guard keeps it that way.

## ADDED Requirements

### Requirement: The code carries no comments

The `.ts` and `.mjs` files of `tab-recap/src`, `tab-recap/bin` and `tab-recap/test` SHALL contain no comment, except a
shebang line and a directive pragma (`@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`, `oxlint-disable`,
`ast-grep-ignore`, `eslint-disable`, or a `/// <reference` line). The guard `recap-no-comments` SHALL fail the lint gate
when a file holds any other comment.

#### Scenario: A source file contains a comment

- **WHEN** a source file under `tab-recap/src` contains a line comment that is not a directive pragma
- **THEN** the guard `recap-no-comments` SHALL report it and `bash ci/lint.sh` SHALL fail

#### Scenario: A source file contains only a directive pragma

- **WHEN** a source file under `tab-recap/src` contains only a directive pragma such as `// @ts-expect-error`
- **THEN** the guard `recap-no-comments` SHALL NOT report it and `bash ci/lint.sh` SHALL pass
