## Purpose

Gates that make the build fail when code leaves its domain: a value crosses a function boundary only as a domain type, raw input
is parsed once at its edge, a brand is applied only by its value's own parser, no directive silences a gate, the module graph
follows its declared edges, every gate proves that it bites, and a ratchet holds the count until the gate is hard.

## ADDED Requirements

### Requirement: Signatures carry domain types only

The lint gate SHALL fail when a parameter or return of any function, method, arrow function, constructor, accessor or
function-typed property in `tab-recap/src/`, a property of a type declared in `src/` that such a signature uses, or a type
parameter constraint, resolves to `string`, `number`, `boolean`, `bigint`, `symbol`, `any`, `object`, `Object` or `Function`, to
a container of those, to an anonymous object-literal type, or to an alias of a primitive without the brand of
`src/recap/domain/brand.ts`. The message SHALL begin with `not supported:`, name the file, line, function and parameter, return or
property, and say to use a value object or domain type. A callback parameter with no annotation, whose type is inferred from a
library declaration, SHALL be skipped.

#### Scenario: A primitive parameter

- **WHEN** a function in `src/` declares a parameter of type `string`
- **THEN** `bash ci/lint.sh` SHALL exit 1 with a line that begins `not supported:` and names that parameter

#### Scenario: An alias of a primitive

- **WHEN** a file declares `type Name = string` and a function takes a `Name`
- **THEN** the check SHALL fail on that parameter, because the alias carries no brand

#### Scenario: A hand-rolled brand

- **WHEN** a function takes `string & { readonly tag: 1 }`
- **THEN** the check SHALL fail on that parameter, because only the marker of `brand.ts` makes a brand

#### Scenario: A value object made of primitives

- **WHEN** a function takes a named interface whose field is a `number`
- **THEN** the check SHALL fail on that field

#### Scenario: A primitive type parameter

- **WHEN** a function declares `<T extends string>(value: T)`
- **THEN** the check SHALL fail on the constraint

#### Scenario: A branded value object

- **WHEN** a function takes a `PaneId` built on `Brand` and returns a `Result` of a domain object
- **THEN** the check SHALL pass it

#### Scenario: A library callback

- **WHEN** an unannotated callback is passed to `.map` over an array whose element type comes from a library declaration
- **THEN** the check SHALL skip its parameter

### Requirement: Raw input is unknown and parsed at one edge per value

`unknown` SHALL appear in a parameter only in a parser (a function named `parse<Name>`, exported from the file that declares
`<Name>`, returning `Result<Name, E>`) or a type guard in that same file. Exceptions SHALL be keyed by file, function and parameter
or return, held per lane, and limited to three classes: a Node or third-party callback that forces a primitive; each released
migration file, as `ci/check-migrations.sh` derives the released set; and the brand function of `brand.ts`. The check SHALL fail on
an exception that no finding hits.

#### Scenario: unknown outside a parser

- **WHEN** a function that is not a parser or type guard declares a parameter of type `unknown`
- **THEN** the check SHALL fail on that parameter

#### Scenario: A stale exception

- **WHEN** an exception names a parameter that no longer receives a primitive
- **THEN** the check SHALL fail and name the entry

#### Scenario: A new migration

- **WHEN** a migration added after the latest release declares a helper `(column: string): string`
- **THEN** the check SHALL fail on it, because only released migrations are excepted

### Requirement: A brand is applied only by its value's own parser

The brand function of `src/recap/domain/brand.ts` SHALL be imported only by the exact, test-held list of files that declare a
branded type, and called only inside the parser or type guard of the file that declares that type. Outside `brand.ts`, no type
assertion SHALL appear in `src/` or `bin/`, neither the `as` form other than `as const` nor the angle-bracket form. A value of type
`any` SHALL NOT be assigned, passed or returned where a domain type is expected.

#### Scenario: A brand applied from the application layer

- **WHEN** a file in `src/recap/application/` calls `brand(raw, 'PaneId')`
- **THEN** the lint gate SHALL fail

#### Scenario: An angle-bracket assertion

- **WHEN** a file in `src/` writes `<PaneId>raw`
- **THEN** the rule `recap-one-brand-cast` SHALL fail on that line

#### Scenario: any laundered into a brand

- **WHEN** a file writes `const id: PaneId = JSON.parse(text)`
- **THEN** the lint gate SHALL fail

### Requirement: No directive silences a gate in production code

No `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `oxlint-disable`, `eslint-disable` or `ast-grep-ignore` directive SHALL appear
in `tab-recap/src/` or `tab-recap/bin/`.

#### Scenario: A suppression in source

- **WHEN** a file in `src/` contains `// @ts-ignore`
- **THEN** the rule `recap-no-suppression` SHALL fail on that line

### Requirement: The module graph is one checked rule set

dependency-cruiser, counting type-only imports, SHALL be the one source for import boundaries in `tab-recap/`: the domain imports
only its own files and the protocol; application, render and i18n import no input or output module; the protocol is
self-contained; only the herdr fleet adapter imports the transport; only the listed files import `brand.ts`; the graph has no
cycle, no orphan and no unresolvable import. The lint gate SHALL fail when the cruise sees fewer modules than the TypeScript files
of `src/` and `bin/`. The ast-grep rules that stated these boundaries one by one SHALL no longer exist.

#### Scenario: A type-only import across a boundary

- **WHEN** a domain file writes `import type { OpenDatabase } from '#src/adapters/db/open.ts'`
- **THEN** the lint gate SHALL fail and name the import

#### Scenario: A cycle between two modules

- **WHEN** a file in `src/recap/application/` and a file in `src/recap/render/` import each other
- **THEN** the lint gate SHALL fail and name the cycle

#### Scenario: An unresolvable import

- **WHEN** a file imports a `#src/` path that does not resolve
- **THEN** the lint gate SHALL fail, so a forbid-style rule cannot pass by not resolving

#### Scenario: The cruise sees too little

- **WHEN** the cruise reports fewer modules than the TypeScript files of `src/` and `bin/`
- **THEN** the lint gate SHALL fail

### Requirement: Every gate proves that it bites

Each gate SHALL keep a bad probe that must fail it and a good probe that must pass it, run by `ci/lint.sh`, including a gate that
waits outside the rule set until its count reaches zero; `ci/lint.sh` SHALL fail when a bad probe passes or a good probe fails.

#### Scenario: A gate that stopped biting

- **WHEN** the signature check is changed so that its `string` parameter probe passes
- **THEN** `bash ci/lint.sh` SHALL exit 1 and name the probe

#### Scenario: A pending rule still bites

- **WHEN** `recap-one-brand-cast` is still in `rules/pending/` and its bad probe stops triggering it
- **THEN** `bash ci/lint.sh` SHALL exit 1

### Requirement: A ratchet holds the count until the gate is hard

While the per-lane baseline files exist, the check SHALL keep one count per category per file and SHALL fail when a count is above
its entry, when it is below its entry (a stale baseline), or when a file without an entry has a finding. A CI guard SHALL fail when,
against the merge base, a baseline entry rises or a new entry appears. Once the baseline files are removed, any finding SHALL fail
the build.

#### Scenario: A file gets worse during the cleanup

- **WHEN** a lane adds a primitive parameter to a file whose parameter count is 3
- **THEN** the check SHALL fail and report 4 against 3

#### Scenario: A baseline stale after a fix

- **WHEN** a lane fixes one assertion in a file and leaves its assertion entry unchanged
- **THEN** the check SHALL fail and ask for the entry to be lowered

#### Scenario: A baseline raised

- **WHEN** a merge request raises a baseline entry or adds a new one
- **THEN** the merge-base guard SHALL fail

#### Scenario: The hard gate

- **WHEN** the baseline files no longer exist and one finding remains
- **THEN** the check SHALL fail
