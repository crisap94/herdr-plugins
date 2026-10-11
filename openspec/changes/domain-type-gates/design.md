# Design: domain types in every signature, held by gates that fail hard

## Context

| Fact | Measured | Where |
| --- | --- | --- |
| `src/` size | 442 TypeScript files, 22 718 lines (2026-10-11, `origin/main`) | `find src -name '*.ts'` |
| `test/` size | 263 `.ts` and `.mjs` files, flat, plus `test/fakes/`, `test/db/`, `test/fixtures/`; by their `#src/*` imports 78 touch one lane, 19 none, 166 two or more | review of 2026-10-11 |
| Brands today | `Brand<Carrier, Name>` in `src/recap/domain/brand.ts` (private `unique symbol` marker), used in 9 files; constructors such as `paneId(raw: string)` cast with `as PaneId` and throw `NotAnIdentifierError` | `src/recap/domain/ids.ts` |
| One result union | `Result<T, E>` in `src/protocol/result.ts`, held by `recap-single-result` | `rules/recap-single-result.yml` |
| Package imports | `#src/*` and `#test/*` in `package.json` `imports` | `package.json` |
| Import rules today | six ast-grep rules, each a `string_fragment` inside `import_statement` (so they also see `import type`): `recap-domain-pure`, `recap-domain-pure-gates`, `recap-layers-no-io`, `recap-protocol-self-contained`, `recap-protocol-exchanges-self-contained`, `recap-transport-boundary` | `rules/*.yml` |
| Released migrations | 20 files frozen byte for byte at `tab-recap-v2.4.0` by `ci/check-migrations.sh`; 11 of the 22 files in `src/adapters/db/schema/` carry primitive helper signatures such as `(column: string): string` | `ci/check-migrations.sh` |
| Order of magnitude | a single-line `grep` over `src/` finds about 1 100 primitive parameters, 500 primitive returns, 360 primitive containers and 107 `as` assertions; a throwaway compiler walk (TypeScript 6.0.3, this `tsconfig.json`, any primitive or literal type, so an upper bound) found about 1 570 annotated and 740 inferred callback parameters (the latter in 195 files) and 1 680 primitive returns, in 18 s cold | 2026-10-11, grep and review |
| Graph measured | dependency-cruiser 18.5 with `tsPreCompilationDeps: true` resolves `#src/*`; 482 modules, 2 269 dependencies, zero cycles, zero orphans; about 1 s | review of 2026-10-11 |

None of the counts is exact. Task 3.6 records the exact counts from the check, per category, and both run times.

## Decisions

### D1. Signatures carry domain types only, checked with the compiler

ast-grep matches syntax and cannot see that `type Name = string` is still a string, so the check uses the TypeScript compiler
API. `bin/check-domain-types.ts` builds one program from a `tsconfig` (the repository's by default; a probe passes its own with
`--project`) and asks the type checker about:

- every parameter and return of every function, method, arrow function, constructor, accessor and function-typed property in
  `src/`;
- every property of every interface, type literal and class declared in `src/` that appears in such a signature, so a value object
  is made of domain types too;
- every type parameter constraint (`<T extends string>` fails).

It resolves through aliases, generics, `Promise`, arrays, tuples, `Map`, `Set`, `Record` and unions. It fails with a message that
begins `not supported:`, names the file, line, function and parameter, return or property, and says `use a value object or domain
type`, when a type resolves to:

- `string`, `number`, `boolean`, `bigint`, `symbol`, `any`, `object`, `Object` or `Function`;
- a container of those (array, tuple, `Map`, `Set`, `Record`, `Promise`, `ReadonlyArray`, `Iterable`);
- an anonymous object-literal type in a signature (the type must be named and declared);
- an alias of a primitive without the brand, including a hand-rolled brand such as `string & { readonly tag: 1 }`.

A brand is recognised only by the `marker` symbol declared in `src/recap/domain/brand.ts`; the check finds that declaration by
path, so the symbol stays private.

Allowed:

- a type built on `Brand`;
- a named interface, class or union of those, declared in `src/`, whose own properties pass this check;
- a named closed union of string literals declared in a domain file;
- `void`, `never`, and `undefined` or `null` in a union with an allowed type;
- `unknown`, only in a parser or type guard (D2).

A callback parameter with no annotation, whose type the compiler infers from a TypeScript or Node library declaration (for
example `items.map((item) => ...)` over a `readonly string[]` from a library), is skipped: the primitive comes from the library,
and the array it came from is already checked where it entered the plugin. An annotated callback parameter is checked like any
other.

`typescript` is a devDependency, pinned to a 6.x release: TypeScript 7 on npm has no JavaScript API, and dependency-cruiser then
silently cruises almost nothing (measured: 9 of 482 modules, exit 0). `bin/check-domain-types.ts` is the one file in `bin/` that
imports it, following `bin/check-protocol-names.ts`; the other `bin/` files are runtime entry points. The check itself obeys
`recap-one-brand-cast` and carries no assertion. No Node built-in resolves TypeScript types. `tsgo` stays the build's type checker.

### D2. Raw input is `unknown`, parsed at one edge per value

A **parser** is a function named `parse<Name>`, exported from the file that declares `<Name>`, taking `unknown` and returning
`Result<Name, E>` with the one `Result` union. A **type guard** `(input: unknown): input is Name` is allowed only in the same file.
`unknown` in any other parameter fails. The places that receive raw values (the configuration reader, the herdr transport decoder,
the database row mappers, the transcript readers, the command-line argument reader) call parsers and pass domain types on.

**Exceptions** are per symbol, never per file or folder. Each entry is `file + function + parameter or return`, with its reason,
in one exception file per lane (`ci/domain-types-exceptions/<lane>.json`). The check fails on an entry that no finding hits.
Three classes exist, and nothing else:

1. a Node or third-party callback that forces a primitive, converted at once in the adapter that receives it;
2. the released migrations, frozen by `ci/check-migrations.sh`: the list names each released migration file, derived from the
   latest `tab-recap-v*` tag the same way that script derives it, and a new migration must comply;
3. `src/recap/domain/brand.ts`, whose one brand function takes the primitive carrier by necessity.

Existing constructors that throw `NotAnIdentifierError` become parsers. Callers in other lanes keep compiling through D7.

### D3. One brand, applied only by its value's own parser

`src/recap/domain/brand.ts` exports the one function that applies a brand. Two rules confine it:

- a dependency-cruiser rule: only the exact list of files that declare a branded type may import `brand.ts`; a test fails when the
  list names a file that no longer declares one, or misses one that does;
- an ast-grep rule `recap-brand-in-own-parser`: a call to the brand function appears only inside the `parse<Name>` (or the type
  guard) of the file that declares `<Name>`.

A third rule, `recap-one-brand-cast`, refuses every type assertion outside `brand.ts`: both the `as` form other than `as const` and
the angle-bracket `type_assertion` form (`<PaneId>raw`), in `src/` and `bin/`. This is stricter than "no cast to a brand" on
purpose: it also refuses `as readonly string[]` and `as unknown as`, because each of those launders a type the same way.

Until Phase C reaches zero assertions, `recap-one-brand-cast` lives in `rules/pending/`, outside the `-maxdepth 1` scan of
`ci/lint.sh`. `ci/lint.sh` still runs its bad and good probes there, so the rule proves it bites the whole time; task 5.2 moves it
into `rules/`. During Phase B the check's ratchet counts the assertions per file (D6).

`any` reaching a brand without an assertion, as in `const id: PaneId = JSON.parse(text)`, is refused by turning on oxlint's
type-aware `typescript/no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-return` and `no-unsafe-member-access`.

### D4. No suppression directive in production code

`// @ts-ignore`, `// @ts-expect-error`, `// @ts-nocheck`, `// oxlint-disable`, `// eslint-disable` and `// ast-grep-ignore` would
silence these gates one line at a time. They stay allowed in `test/`, and are refused in `src/` and `bin/` by an ast-grep rule,
`recap-no-suppression`. None exists there today, so the rule is hard from Phase A. This narrows the `code-comments` capability,
which today allows those pragmas everywhere; the change restates that requirement.

### D5. The module graph is one checked rule set

dependency-cruiser, configured in `tab-recap/.dependency-cruiser.cjs` with `options.tsPreCompilationDeps: true` (so `import type`
counts, as it does for the ast-grep rules it replaces), is the one source for import boundaries:

- `src/recap/domain/` imports only its own files and `src/protocol/`; `src/recap/domain/gates/` imports only its own files and one
  file of its parent folder;
- `src/recap/application/`, `src/recap/render/` and `src/i18n/` import no `node:` module except `node:util`, and nothing from
  `src/adapters/`, `src/transport/`, `src/daemon/`, `src/column/` or `src/setup/`;
- `src/protocol/` imports only its own files; `src/protocol/exchanges/` imports its own folder and one level up;
- only `src/adapters/herdr-fleet.ts` and `src/transport/` import `src/transport/`;
- only the files of D3's list import `brand.ts`;
- no cycle; no orphan (dependency-cruiser's orphan rule, with no list of entry points: the daemon, column, compact and setup
  `main.ts` files are loaded by URL from `src/host/launch.mjs`, which the graph cannot see, so an entry-point reachability rule would
  report them falsely);
- no unresolvable import (`not-to-unresolvable`), so a "forbid" rule cannot pass because a path failed to resolve.

`ci/lint.sh` also fails when the cruise reports fewer modules than `find src bin -name '*.ts'` counts, so a missing transpiler can
never make the graph check pass empty.

The six ast-grep import rules are retired in the same merge request that turns these rules on, so each boundary is stated once.

### D6. A ratchet until the gate is hard

During Phase B the check reads one baseline file per lane, `ci/domain-types-baseline/<lane>.json`, holding per file one count per
category: `parameter`, `return`, `container`, `property`, `assertion`, `legacy`. The rules:

- a count above its entry fails;
- a count below its entry also fails, as a stale baseline: the contributor lowers the entry in the same merge request, and deletes it
  at zero, so a fix can never pay for a later regression;
- a category never pays for another: one assertion fixed does not allow one primitive parameter;
- a file with no entry must have no finding;
- a CI guard, `ci/check-domain-baseline.sh`, in the style of `ci/check-migrations.sh`, compares every baseline file with the merge
  base: no entry may rise and no new entry may appear.

Phase C deletes the baseline folder; from then on any finding fails the build.

### D7. Lanes stay parallel through a legacy file, not shared edits

A lane that changes an exported signature used outside its folders adds the new, domain-typed export and moves the old export into
its own `legacy.ts` (for example `src/recap/domain/legacy.ts`), as a thin wrapper over the new one. Callers in other lanes keep
compiling against the legacy export until their own lane moves them. Legacy findings are counted in the lane's own baseline under
the `legacy` category; a lane's verify line excludes only that category. Phase C deletes every `legacy.ts` once no caller remains.
The old throwing constructors of `src/recap/domain/ids.ts` take this path in lane B2.

### D8. Ownership is a checked map

Phase A writes `ci/lanes.json`, which assigns every file of `src/` and `test/` to exactly one lane. A test file goes to the lane
of the module it is named after (`test/<name>.test.ts` follows `src/**/<name>.ts`); otherwise to the lane of the first lane-owned
module it imports, in the order B2, B1, B3, B4, B5, B6, B7, B8. `test/fakes/` and `test/fixtures/` belong to the lead. A test
fails when a file is missing from the map or listed twice, and each lane's CI job fails when its merge request edits a file the
map gives to another lane. Another lane's test that needs a change goes through that lane or the lead.

## Phases and order

- **Phase A** (the maintainer lead, one merge request, lands first): the shared vocabulary that every lane needs before it starts
  (ids, the parser signature, the common text, count and duration types, all nouns added to `CONTEXT.md`), the tools, every gate with
  its probes, the per-lane baselines and exception files, `ci/lanes.json`.
- **Phase B** (lanes): B1 (protocol, ports) and B2 (domain) start at once. B3 to B8 may start at the same time, because D7 keeps the
  old exports compiling; each moves to the new B1 and B2 exports as they land.
- **Phase C** (the lead): remove every `legacy.ts`, move `recap-one-brand-cast` into `rules/`, delete the baseline folder, final counts.

The three in-flight `lane-handoff*` changes: slice 1 lands before Phase A merges, and Phase A's baselines are generated on the merge
result; slices 2 and 3 are written after Phase A and follow the gates (their new files start at zero).

### How probes run

The signature check takes `--project <tsconfig>`; each bad and good probe is a small folder with its own `tsconfig.json`. Each
dependency-cruiser fixture is a folder with its own `package.json` (with the same `imports` map) and a `src/` layout, following the
precedent of `rules/probes/recap-sqlite-readonly/good-own-database/src/`. A probe that relies on `#src/*` resolution therefore
resolves inside the fixture, not against the repository.

## Module map

| Lane | Folders | Files |
| --- | --- | --- |
| B1 protocol and ports | `src/protocol/`, `src/ports/` | 13 + 51 |
| B2 domain | `src/recap/domain/` (gates included) | 72 |
| B3 application | `src/recap/application/` | 94 |
| B4 render and text | `src/recap/render/`, `src/i18n/`, `src/column/` | 16 + 7 + 4 |
| B5 database | `src/adapters/db/` | 67 |
| B6 other adapters | `src/adapters/` except `db/` | 78 |
| B7 daemon and edges | `src/daemon/`, `src/extensions/`, `src/compact/`, `src/setup/`, `src/transport/` | 16 + 4 + 1 + 1 + 1 |
| B8 experiments | `src/experiment/` | 17 |

A lane edits only the `src/` files and the `test/` files that `ci/lanes.json` gives it, plus its own `legacy.ts`, baseline file and
exception file. New shared vocabulary goes through the lead.

## Standards

- **DDD.** A value crosses a function boundary only as a domain type; raw input is parsed once, at its edge, by the value's own
  parser; one brand function, applied only there; one `Result` union.
- **SOLID.** Single responsibility per module folder and per lane; the module graph points inward to the domain, with ports in
  `src/ports/` (dependency inversion); each gate is one tool for one concern (the compiler for types, dependency-cruiser for imports,
  ast-grep for syntax, oxlint for unsafe `any` flow).
- **DRY.** Each boundary is stated once, in the dependency-cruiser configuration; each value has one parser; each ownership fact
  lives in `ci/lanes.json`.
- No comments in code, as `recap-no-comments` already requires.

## Risks

- The check's run time on 442 files is UNMEASURED for the real walk (the review's cheaper walk took 18 s). Task 3.6 records it with
  the dependency-cruiser run time; the check stays in `ci/lint.sh` only if both together add less than 60 seconds, otherwise it runs
  as its own CI job.
- Legacy wrappers keep both shapes alive during Phase B; the `legacy` category makes that visible per file, and Phase C removes
  them.
