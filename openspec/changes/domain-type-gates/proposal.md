# Proposal: domain types in every signature, held by gates that fail hard

## Why

tab-recap already names its domain: branded ids in `src/recap/domain/ids.ts`, one `Result<T, E>`, a pure fold, and import
rules that keep the domain away from input and output. The rule stops at the edge of a value, though. A function may still
take a `string` or return a `number`, and nothing stops a raw value from crossing a module boundary under a primitive name.
A rough count over `src/` finds about 1 100 parameters, 500 returns and 360 containers typed with a primitive, and about 100
type assertions to a named type. The maintainers want the domain enforced the same way everywhere, so that every agent and
contributor who writes code gets the same answer from the build: a domain type, or the build fails.

The import rules also live in six separate ast-grep rules, each restating one edge of the module graph. One checked graph
says the same with less text and covers cycles and orphans, which no single rule can see.

## What changes

- A new capability `code-gates` with six requirements: signatures carry domain types only; raw input is `unknown` and is
  parsed at one edge per value; a brand is applied in one place and no other type assertion exists; the module graph is one
  checked rule set; every gate proves it bites with a bad and a good probe; and a ratchet holds the count until the gate is
  hard.
- A type-aware check, `bin/check-domain-types.ts`, written against the TypeScript compiler API. It resolves every parameter and
  return of every function, method, arrow function, constructor and callback type in `src/` through aliases, generics,
  `Promise`, arrays, tuples, maps, sets, records and unions. It fails with a message that begins `not supported:` when one
  resolves to a primitive, to a container of primitives, or to an unbranded alias of a primitive.
- dependency-cruiser becomes the one source for import boundaries. It replaces six ast-grep rules: `recap-domain-pure`,
  `recap-domain-pure-gates`, `recap-layers-no-io`, `recap-protocol-self-contained`, `recap-protocol-exchanges-self-contained` and
  `recap-transport-boundary`. The ast-grep rules that are not about imports stay.
- An ast-grep rule `recap-one-brand-cast` forbids `as` assertions other than `as const` outside `src/recap/domain/brand.ts`.
- `typescript` and `dependency-cruiser` join the devDependencies. Nothing changes at runtime: tab-recap keeps zero runtime
  dependencies.
- The work is phased so it can run in parallel: Phase A (the maintainer lead) builds the check, the graph rules, the probes and
  the ratchet; Phase B is one lane per module, each fixing only its own files; Phase C turns the ratchet into the hard gate.

## Out of scope

- Any behaviour change. Every test that passes today passes after each phase.
- `bin/` command entry points and `test/`: they parse arguments and build fixtures, so they stay outside the signature check;
  `bin/` remains under the boundary graph.
- `src/host/`, which is JavaScript with declaration files.
- Other repositories.

## Changelog label

`changelog::internal`
