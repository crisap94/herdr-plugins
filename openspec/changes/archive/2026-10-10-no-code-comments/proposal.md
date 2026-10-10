# Proposal

## Why

The code of tab-recap carries about 2,500 comments: JSDoc on nearly every type and function, and line comments
that restate what the next lines do. Most of them say what a name or a type already says; some hold rationale
that a future maintainer needs (why a number is what it is, which order must be kept, what a caller must not do),
and that rationale rots when it sits beside the code it describes. The operator's rule is that the code carries
no comments: meaning belongs in names, types, small functions and tests, and rationale belongs in the documents
that own it. This change removes the comments, relocates what must survive, and makes the rule a guard that fails
the build when a comment comes back.

## What Changes

- **Every comment is removed from `tab-recap/src`, `tab-recap/bin` and `tab-recap/test`** (`*.ts`, `*.mts` and
  `*.mjs`), except the 19 released migrations under `src/adapters/db/schema/`, which `ci/check-migrations.sh` keeps
  byte-identical (their 32 comments stay). The removal is done by a codemod on the TypeScript parser's trivia, never by text matching, so a `//`
  inside a string, a template or a regular expression is untouched. A shebang line and the directive pragmas
  (`@ts-expect-error`, `@ts-ignore`, `oxlint-disable…`, `ast-grep-ignore`, `/// <reference`) stay. Blank lines
  that the removal leaves are collapsed to one.
- **Each removed comment is triaged**, not deleted blindly. Its information goes to the one place that owns it:
  a domain term to `tab-recap/CONTEXT.md`; an operator-facing default, limit or measured herdr behaviour to
  `tab-recap/README.md`; a design rationale to this change's `design.md`; a constraint already pinned by a test is
  left to that test; a restatement of the code is dropped. The relocations are counted per destination in the merge
  request description.
- **A guard** `recap-no-comments` joins the red-line rules in `tab-recap/rules/`: an ast-grep rule on the `comment`
  node, excluding the directive pragmas, with a bad probe it must bite and a good probe it must pass. The rule runs
  in `ci/lint.sh` like the others.
- **The rule is documented** in `tab-recap/CLAUDE.md` (the red-lines table) and `tab-recap/README.md` (the gates
  section), so a contributor learns it before the guard fails.

## Out of scope

- Behaviour. This is a pure refactor: no runtime code changes except the removal of comments, no test changes, no
  new configuration key, no change to any output. The existing test suite passes unchanged.
- The `ci/`, `docs/screens/` and `rules/probes/` trees: they are tooling, not the plugin, and the guard checks what the
  plugin ships. Their comments are not removed here.
- Type-level encodings of rationale that would require changing signatures; a rationale that needs one is recorded
  as a candidate in `design.md` and not encoded in this change.
- Any change to the archived changes and to the main specs under `openspec/specs/`, other than the new capability
  `code-comments` that archiving adds.

## Impact

- Code: every `.ts` and `.mjs` file under `tab-recap/src`, `tab-recap/bin` and `tab-recap/test` loses its comments
  (2,455 comments removed; the blank lines they leave collapsed). `git diff --stat` shows deletions plus the rule and
  documentation additions only.
- Rules: `tab-recap/rules/recap-no-comments.yml` and its probes under `tab-recap/rules/probes/recap-no-comments/`.
- Docs: `tab-recap/CONTEXT.md`, `tab-recap/README.md`, `tab-recap/CLAUDE.md`, this change's `design.md`.
- Behaviour: none. Typecheck, lint, oxlint and the full test suite pass before and after.

## Changelog

The merge request carries the label `changelog::internal`. It changes nothing a user of the plugin can see.
