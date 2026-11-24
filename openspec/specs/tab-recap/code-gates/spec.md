# tab-recap/code-gates Specification

## Purpose

Gates that make the build fail when code leaves its domain: a value crosses a function boundary only as a domain type, raw input
is parsed once at its edge, a brand is applied only by its value's own parser, no directive silences a gate, the module graph
follows its declared edges, every gate proves that it bites, and any finding fails the build.

## Requirements

### Requirement: Signatures carry domain types only

The lint gate SHALL fail when a parameter, return, declared-type property or type parameter constraint in `tab-recap/src/` resolves
to a primitive, `any`, `object`, `Function`, a container of those, an anonymous object-literal type, or an unbranded alias of a
primitive. The message SHALL begin with `not supported:`, name the file, line and symbol, and say to use a value object or domain
type. An unannotated callback parameter inferred from a library declaration SHALL be skipped.

#### Scenario: A primitive parameter

- **WHEN** a function, method, arrow function, constructor, accessor or function-typed property in `src/` declares a parameter of type `string`, `number`, `boolean`, `bigint` or `symbol`
- **THEN** `bash gates/run.sh lint` SHALL exit 1 with a line that begins `not supported:` and names that parameter

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

`unknown` SHALL appear in a parameter only in a parser (`parse<Name>` exported from the file that declares `<Name>`, returning
`Result<Name, E>`) or a type guard in that same file. Exceptions SHALL be keyed by file and symbol, held per lane, and limited to
four classes. The check SHALL fail on an exception that no finding hits.

#### Scenario: unknown outside a parser

- **WHEN** a function that is not a parser or type guard declares a parameter of type `unknown`
- **THEN** the check SHALL fail on that parameter

#### Scenario: A stale exception

- **WHEN** an exception names a parameter that no longer receives a primitive
- **THEN** the check SHALL fail and name the entry

#### Scenario: A new migration

- **WHEN** a migration added after the latest release declares a helper `(column: string): string`
- **THEN** the check SHALL fail on it, because only released migrations are excepted

#### Scenario: The four exception classes

- **WHEN** an exception is listed
- **THEN** it SHALL be (1) a library callback, or a signature fixed by a frozen package, that forces a primitive; (2) a released migration file, as `ci/check-migrations.sh` derives the released set; (3) the brand function of `brand.ts`; or (4) a plain field of a wire contract under `src/wire/`, keyed by symbol and field

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

dependency-cruiser, counting type-only imports, SHALL be the one source for import boundaries in `tab-recap/`, and the graph SHALL
have no cycle, no orphan and no unresolvable import. The lint gate SHALL fail when the cruise sees fewer modules than the
TypeScript files of `src/` and `bin/`. The ast-grep rules that stated these boundaries one by one SHALL no longer exist.

#### Scenario: The declared edges hold

- **WHEN** the cruise runs over `src/` and `bin/`
- **THEN** the domain SHALL import only its own files and the protocol, application, render and i18n SHALL import no input or output module, the protocol SHALL be self-contained, only the herdr fleet adapter SHALL import the transport, and only the listed files SHALL import `brand.ts`

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

Each gate SHALL keep a bad probe that must fail it and a good probe that must pass it, run by `gates/run.sh lint`;
`gates/run.sh lint` SHALL fail when a bad probe passes or a good probe fails.

#### Scenario: A gate that stopped biting

- **WHEN** the signature check is changed so that its `string` parameter probe passes
- **THEN** `bash gates/run.sh lint` SHALL exit 1 and name the probe

#### Scenario: The brand-cast rule still bites

- **WHEN** the bad probe of `recap-one-brand-cast` stops triggering it
- **THEN** `bash gates/run.sh lint` SHALL exit 1

### Requirement: Any finding fails the build

The check SHALL fail the build on any finding that no exception covers, and no baseline file SHALL exist.

#### Scenario: The hard gate

- **WHEN** one finding remains
- **THEN** the check SHALL fail

#### Scenario: A baseline file is added

- **WHEN** a merge request adds `tab-recap/ci/domain-types-baseline/`
- **THEN** `bash gates/run.sh lint` SHALL still fail on the finding, because the check reads no baseline
