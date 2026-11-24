## MODIFIED Requirements

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

