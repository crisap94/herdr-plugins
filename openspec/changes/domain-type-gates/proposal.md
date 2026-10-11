# Proposal: domain types in every signature, held by gates that fail hard

## Why

tab-recap already names its domain: branded ids in `src/recap/domain/ids.ts`, one `Result<T, E>`, a pure fold, and import
rules that keep the domain away from input and output. The rule stops at the edge of a value, though. A function may still
take a `string` or return a `number`, and nothing stops a raw value from crossing a module boundary under a primitive name.
A rough count over `src/` finds well over a thousand primitive parameters, several hundred primitive returns and about a
hundred type assertions. The maintainers want the domain enforced the same way everywhere, so that every agent and
contributor who writes code gets the same answer from the build: a domain type, or the build fails.

The import rules also live in six separate ast-grep rules, each restating one edge of the module graph. One checked graph
says the same with less text and covers cycles and orphans, which no single rule can see.

## What changes

- A new capability `code-gates` with seven requirements: signatures carry domain types only; raw input is `unknown` and is
  parsed at one edge per value; a brand is applied only by its value's own parser; no directive silences a gate in production
  code; the module graph is one checked rule set; every gate proves that it bites; and a ratchet holds the count until the gate
  is hard.
- A type-aware check, `bin/check-domain-types.ts`, written against the TypeScript compiler API. It resolves every parameter,
  return, declared property and type parameter constraint in `src/` through aliases, generics, `Promise`, arrays, tuples, maps,
  sets, records and unions, and fails with a message that begins `not supported:`.
- Exceptions are per symbol and limited to three classes: a callback that forces a primitive, each released migration file, and
  the one brand function.
- dependency-cruiser, counting type-only imports, becomes the one source for import boundaries. It replaces six ast-grep rules:
  `recap-domain-pure`, `recap-domain-pure-gates`, `recap-layers-no-io`, `recap-protocol-self-contained`,
  `recap-protocol-exchanges-self-contained` and `recap-transport-boundary`.
- New rules: `recap-brand-in-own-parser`, `recap-one-brand-cast` (no type assertion outside `brand.ts`, both forms) and
  `recap-no-suppression`; oxlint's unsafe-`any` rules are turned on.
- The capability `code-comments` narrows: suppression pragmas stay allowed in `test/` only.
- `typescript` (6.x) and `dependency-cruiser` join the devDependencies. Nothing changes at runtime: tab-recap keeps zero runtime
  dependencies.
- The work is phased so it can run in parallel: Phase A (the maintainer lead) builds the shared vocabulary, the check, the graph
  rules, the probes, per-lane baselines and exception files, and a checked map of which lane owns each file; Phase B is one lane per
  module, kept parallel by per-lane legacy exports; Phase C removes the legacy exports and turns the ratchet into the hard gate.

## Out of scope

- Any behaviour change. Every test that passes today passes after each phase.
- `bin/` command entry points and `test/`: they parse arguments and build fixtures, so they stay outside the signature check;
  `bin/` remains under the boundary graph and the assertion and suppression rules.
- `src/host/`, which is JavaScript with declaration files.
- Other repositories.

## Changelog label

`changelog::internal`
