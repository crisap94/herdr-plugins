## Purpose

Gates that make the build fail when code leaves its domain: a value crosses a function boundary only as a domain type, raw input
is parsed once at its edge, a brand is applied in one place, the module graph follows its declared edges, and every gate proves
that it bites.

## ADDED Requirements

### Requirement: Signatures carry domain types only

The lint gate SHALL fail when a parameter or return of any function, method, arrow function, constructor, accessor or
function-typed property in `tab-recap/src/` resolves to `string`, `number`, `boolean`, `bigint`, `symbol`, `any`, `object`,
`Object` or `Function`, to a container of those, or to an alias of a primitive without a brand. The message SHALL begin with
`not supported:`, name the file, line, function and parameter or return, and say to use a value object or domain type.

#### Scenario: A primitive parameter

- **WHEN** a function in `src/` declares a parameter of type `string`
- **THEN** `bash ci/lint.sh` SHALL exit 1 with a line that begins `not supported:` and names that parameter

#### Scenario: An alias of a primitive

- **WHEN** a file declares `type Name = string` and a function takes a `Name`
- **THEN** the check SHALL fail on that parameter, because the alias carries no brand

#### Scenario: A container of primitives returned

- **WHEN** a method returns `Promise<readonly number[]>`
- **THEN** the check SHALL fail on that return

#### Scenario: A branded value object

- **WHEN** a function takes a `PaneId` built on `Brand` and returns a `Result` of a domain object
- **THEN** the check SHALL pass it

### Requirement: Raw input is unknown and parsed at one edge per value

A value's parser SHALL take `unknown` and return the repository's one `Result` union. `unknown` SHALL appear in a parameter only
in a parser. A Node or third-party callback that forces a primitive SHALL be converted at once in an adapter file named in the
check's exact exception list, and a test SHALL fail when that list names a file that no longer needs it or misses a file that
does.

#### Scenario: unknown outside a parser

- **WHEN** a function that is not a parser declares a parameter of type `unknown`
- **THEN** the check SHALL fail on that parameter

#### Scenario: A stale exception

- **WHEN** a file in the exception list no longer receives a primitive from a callback
- **THEN** the exception-list test SHALL fail and name the file

### Requirement: A brand is applied in one place

No `as` assertion other than `as const` SHALL appear in `src/` or `bin/` outside `src/recap/domain/brand.ts`; a parser SHALL
apply a brand through the one function `brand.ts` exports.

#### Scenario: A cast to a brand in a constructor

- **WHEN** a constructor returns `raw as PaneId`
- **THEN** the rule `recap-one-brand-cast` SHALL fail on that line

### Requirement: The module graph is one checked rule set

dependency-cruiser SHALL be the one source for import boundaries in `tab-recap/`: the domain imports only its own files and the
protocol; application, render and i18n import no input or output module; the protocol is self-contained; only the herdr fleet
adapter imports the transport; the graph has no cycles; and no file is unreachable from an entry point. The ast-grep rules that
stated these boundaries one by one SHALL no longer exist.

#### Scenario: A cycle between two modules

- **WHEN** a file in `src/recap/application/` and a file in `src/recap/render/` import each other
- **THEN** the lint gate SHALL fail and name the cycle

#### Scenario: A package import resolved

- **WHEN** a domain file imports `#src/adapters/db/connection.ts`
- **THEN** the lint gate SHALL fail, because dependency-cruiser resolves the `#src/*` import to an adapter

### Requirement: Every gate proves that it bites

Each gate SHALL keep a bad probe that must fail it and a good probe that must pass it, and `ci/lint.sh` SHALL fail when a bad
probe passes or a good probe fails.

#### Scenario: A gate that stopped biting

- **WHEN** the signature check is changed so that its `string` parameter probe passes
- **THEN** `bash ci/lint.sh` SHALL exit 1 and name the probe

### Requirement: A ratchet holds the count until the gate is hard

While `ci/domain-types-baseline.json` exists, the signature check SHALL fail when a file has more findings than its baseline
entry, or when a file without an entry has any finding. Once the baseline file is removed, any finding SHALL fail the build.

#### Scenario: A file gets worse during the cleanup

- **WHEN** a lane adds a primitive parameter to a file whose baseline is 3
- **THEN** the check SHALL fail and report 4 against a baseline of 3

#### Scenario: The hard gate

- **WHEN** the baseline file no longer exists and one finding remains
- **THEN** the check SHALL fail
