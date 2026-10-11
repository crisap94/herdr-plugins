# Design: domain types in every signature, held by gates that fail hard

## Context

| Fact | Measured | Where |
| --- | --- | --- |
| `src/` size | 442 TypeScript files, 22 718 lines (2026-10-11, `origin/main`) | `find src -name '*.ts'` |
| Brands today | `Brand<Carrier, Name>` in `src/recap/domain/brand.ts`, used in 9 files; constructors such as `paneId(raw: string)` cast with `as PaneId` and throw `NotAnIdentifierError` | `src/recap/domain/ids.ts` |
| One result union | `Result<T, E>` in `src/protocol/result.ts`, held by `recap-single-result` | `rules/recap-single-result.yml` |
| Package imports | `#src/*` and `#test/*` in `package.json` `imports` | `package.json` |
| Import rules today | six ast-grep rules match the import path string of `import_statement`: `recap-domain-pure`, `recap-domain-pure-gates`, `recap-layers-no-io`, `recap-protocol-self-contained`, `recap-protocol-exchanges-self-contained`, `recap-transport-boundary` | `rules/*.yml` |
| Rough violation count | about 1 096 parameters, 512 returns and 365 containers typed with a primitive, and 99 `as` assertions to a named type | a single-line `grep` over `src/` on 2026-10-11 |

The grep count is not exact. It misses signatures that span lines and counts some property annotations that are not
parameters. Task A.6 records the exact count from the check itself and replaces this row.

## Decisions

### D1. Signatures carry domain types only, checked with the compiler

ast-grep matches syntax. It cannot see that `type Name = string` is still a string, so `function f(name: Name)` would pass a
syntax rule. The check therefore uses the TypeScript compiler API (`typescript` package): `bin/check-domain-types.ts` builds one
program from `tsconfig.json`, walks every function, method, arrow function, constructor, accessor and function-typed property
in `src/`, and asks the type checker for each parameter and return type. It resolves through aliases, generics, `Promise`,
arrays, tuples, `Map`, `Set`, `Record` and unions.

The check fails, with a message that begins `not supported:` and names the file, line, function and parameter or return, and
then says `use a value object or domain type`, when a type resolves to any of:

- `string`, `number`, `boolean`, `bigint`, `symbol`, `any`, `object`, `Object` or `Function`;
- a container of those (array, tuple, `Map`, `Set`, `Record`, `Promise`, `ReadonlyArray`, `Iterable`);
- an alias of a primitive that carries no brand.

Allowed:

- a type built on `Brand` (the brand is the intersection with the marker symbol);
- an object, interface, class or union of objects declared in the plugin;
- a named closed union of string literals declared in a domain file;
- `void`, `never`, and `undefined` or `null` inside a union with an allowed type;
- type predicates;
- `unknown`, only as the parameter of a parser at an edge (D2).

Why not a linter plugin: the repository already lints with oxlint and ast-grep. oxlint's JavaScript plugins reached alpha in
March 2026, and type-aware custom rules there depend on third-party work in progress. typescript-eslint would add a second linter
for one rule. A compiler-API script is one file of development tooling, runs in `ci/lint.sh` like `bin/check-protocol-names.ts`,
and reads the same `tsconfig.json`. No Node built-in can resolve TypeScript types, so the `typescript` package is the one tool
that fits. `tsgo` stays the type checker for the build; its native preview has no stable JavaScript API for this walk.

### D2. Raw input is `unknown`, parsed at one edge per value

A value's own file exports its parser, `parse<Name>(input: unknown): Result<Name, ParseError>`, using the one `Result` union.
The places that receive raw values (the configuration reader, the herdr transport decoder, the database row mappers, the
transcript readers, the command-line argument reader) call those parsers and pass domain types onward.

Where a Node or third-party callback forces a primitive on us (for example `node:sqlite` rows or `node:util` `parseArgs`
values), the adapter that receives it converts at once. The check holds an exact list of those adapter files. A test fails if
the list names a file that no longer needs the exception, or if a file needs it and is not listed. No folder-wide ignore exists.

Existing constructors that throw `NotAnIdentifierError` become parsers that return `Result`. Callers that rely on the throw are
moved in the same lane, so behaviour does not change.

### D3. One brand, applied in one place

`src/recap/domain/brand.ts` gains the one function that applies a brand. A parser returns `brand(value, name)` instead of
`value as Name`. A new ast-grep rule, `recap-one-brand-cast`, fails on any `as` assertion other than `as const` outside
`brand.ts`, in `src/` and `bin/`. Tests may still build fixtures through the parsers; they never cast. While the ratchet of D6
exists, the check counts these assertions per file with the signature findings; the ast-grep rule joins the rule set in Phase C,
when the count is zero.

### D4. The module graph is one checked rule set

dependency-cruiser, configured in `tab-recap/.dependency-cruiser.cjs`, is the one source for import boundaries. It covers what the
six import rules covered, plus what no single rule can see:

- `src/recap/domain/` imports only its own files and `src/protocol/`; `src/recap/domain/gates/` imports only its own files and
  their parent domain files;
- `src/recap/application/`, `src/recap/render/` and `src/i18n/` import no `node:` module except `node:util`, and nothing from
  `src/adapters/`, `src/transport/`, `src/daemon/`, `src/column/` or `src/setup/`;
- `src/protocol/` imports only its own files; `src/protocol/exchanges/` imports its own folder and one level up;
- only `src/adapters/herdr-fleet.ts` imports `src/transport/`;
- the module graph has no cycles, and no file is unreachable from an entry point.

The six ast-grep rules are retired in the same merge request that turns the dependency-cruiser rules on, so each boundary is
stated once. dependency-cruiser must resolve the `#src/*` package imports; task A.4 proves this on a probe before any rule
relies on it.

### D5. Every gate bites

Each gate keeps a bad and a good probe, the way `ci/lint.sh` already runs the ast-grep rules:

- the signature check: one bad probe per case (parameter, return, arrow function, method, constructor, callback type, array,
  `Promise`, `Record`, alias of a primitive, `unknown` outside a parser) and a good probe of each allowed form;
- `recap-one-brand-cast`: a bad and a good probe;
- each dependency-cruiser rule: a bad and a good fixture folder.

`ci/lint.sh` fails if a bad probe passes or a good probe fails.

### D6. A ratchet until the gate is hard

The count is too large to clear in one merge request. During Phase B the check reads `ci/domain-types-baseline.json`, which
records the exact number of findings per file (signature findings and type assertions together). A file may only go down; a new file must have none; a file at zero is removed
from the baseline. Phase C deletes the baseline file, and from then on any finding fails the build.

## Module map

The lanes of Phase B follow the folders of `src/` (2026-10-11):

| Lane | Folders | Files |
| --- | --- | --- |
| B1 protocol and ports | `src/protocol/`, `src/ports/` | 13 + 51 |
| B2 domain | `src/recap/domain/` (gates included) | part of 182 under `src/recap/` |
| B3 application | `src/recap/application/` | 94 |
| B4 render and text | `src/recap/render/`, `src/i18n/`, `src/column/` | 16 + 7 + 4 |
| B5 database | `src/adapters/db/` | part of 145 under `src/adapters/` |
| B6 other adapters | `src/adapters/` except `db/` | rest of 145 |
| B7 daemon and edges | `src/daemon/`, `src/extensions/`, `src/compact/`, `src/setup/`, `src/transport/` | 16 + 4 + 1 + 1 + 1 |
| B8 experiments | `src/experiment/` | 17 |

A lane edits only its folders and their tests. A new value object that more than one lane needs is added by the lead in
`src/recap/domain/` before the lanes that need it start. A lane adds module-local value objects only in its own folders.

## Standards

- **DDD.** A value crosses a function boundary only as a domain type; raw input is parsed once at its edge; one brand function
  and one `Result` union.
- **SOLID.** Single responsibility per module folder; the module graph points inward to the domain (dependency inversion through
  `src/ports/`); each gate is one tool for one concern (the compiler for types, dependency-cruiser for imports, ast-grep for
  syntax).
- **DRY.** Each boundary is stated once, in the dependency-cruiser configuration; each value has one parser.
- No comments in code, as `recap-no-comments` already requires.

## Risks

- The check walks every signature; its run time on 442 files is UNMEASURED. Task A.6 records it, and the check stays in
  `ci/lint.sh` only if it adds less than 60 seconds; otherwise it gets its own CI job.
- Converting throwing constructors to `Result` touches callers in other lanes. Each lane changes only its own callers; a caller in
  another lane keeps compiling because the old constructor stays as a thin wrapper over the parser until Phase C removes it.
