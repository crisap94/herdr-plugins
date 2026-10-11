# Tasks: domain types in every signature

Phase A is done by the maintainer lead in one merge request and lands first. Phase B lanes start after it and run in parallel:
each edits only its own folders and their tests. Phase C is done by the lead after every lane has landed. Every group ends with
the plugin gates passing (`bash ci/lint.sh` and `bash ci/test.sh`, from `tab-recap/`).

## 1. Phase A: vocabulary, tools and the brand (lead)

- [ ] 1.1 Add the nouns `domain type`, `parser`, `edge` and `exception list` to `tab-recap/CONTEXT.md` before any code. Verify:
      the vocabulary step of `ci/lint.sh` passes.
- [ ] 1.2 Add `typescript` and `dependency-cruiser` to `devDependencies` with exact versions; `dependencies` stays absent. Verify:
      `package.json` has no `dependencies` field and `npm ci` passes.
- [ ] 1.3 `src/recap/domain/brand.ts` exports the one brand function; `recap-one-brand-cast` written with a bad and a good probe
      but not yet in the rule set (it switches on in 5.2). Verify: run on its probes alone, the bad probe fails it and the good
      probe passes.

## 2. Phase A: the module graph (lead)

- [ ] 2.1 `tab-recap/.dependency-cruiser.cjs` with the rules of design D4, wired into `ci/lint.sh`. Verify: the tree passes.
- [ ] 2.2 Prove `#src/*` resolution: a probe where a domain file imports `#src/adapters/db/connection.ts` fails the graph check.
      Verify: the probe fails with that path named, before any other rule relies on resolution.
- [ ] 2.3 A bad and a good fixture folder per rule (domain purity, gates purity, no input or output in application, render and
      i18n, protocol self-contained, exchanges, transport boundary, no cycles, no orphans). Verify: `ci/lint.sh` fails on each bad
      fixture and passes on each good one.
- [ ] 2.4 Retire `recap-domain-pure`, `recap-domain-pure-gates`, `recap-layers-no-io`, `recap-protocol-self-contained`,
      `recap-protocol-exchanges-self-contained` and `recap-transport-boundary` with their probes, in the same merge request as 2.1.
      Verify: each boundary they stated has a dependency-cruiser fixture that fails.

## 3. Phase A: the signature check and the ratchet (lead)

- [ ] 3.1 `bin/check-domain-types.ts` per design D1: one program from `tsconfig.json`, every signature in `src/`, the
      `not supported:` message. Verify: a bad probe per case (parameter, return, arrow function, method, constructor, callback
      type, array, `Promise`, `Record`, alias of a primitive, `unknown` outside a parser) fails, and a good probe per allowed form
      passes.
- [ ] 3.2 The exact exception list and its test (design D2). Verify: a probe that adds a stale entry fails the test, and one that
      removes a needed entry fails it.
- [ ] 3.3 The ratchet: `ci/domain-types-baseline.json` written by the check from the current tree, counting signature findings
      and `as` assertions other than `as const` outside `brand.ts`, read on every run (design D6).
      Verify: adding a finding to a counted file fails; a new file with a finding fails; lowering a count passes and updates
      nothing until the file reaches zero.
- [ ] 3.4 Record in design.md's Context table the exact counts from the check (parameters, returns, containers, assertions) and
      its run time on `src/`. If the run adds 60 seconds or more to `ci/lint.sh`, move it to its own CI job. Verify: the table
      row is replaced and the CI step exists.
- [ ] 3.5 `CONTRIBUTING.md` gains a section on domain types: what the check refuses, where parsers live, how to read a
      `not supported:` line, and that the exception list is never widened by folder. Verify: the section exists and names the
      check's command.

## 4. Phase B: one lane per module (parallel)

Each lane converts its signatures to domain types, turns its throwing constructors into parsers that return `Result`, removes its
type assertions, and lowers its baseline entries to zero. A lane edits only the folders listed and their tests. A value object
needed by two lanes is added by the lead in `src/recap/domain/` first.

- [ ] 4.1 B1 `src/protocol/`, `src/ports/`. Verify: no baseline entry remains under these folders.
- [ ] 4.2 B2 `src/recap/domain/` (gates included). Verify: no baseline entry remains under this folder.
- [ ] 4.3 B3 `src/recap/application/`. Verify: no baseline entry remains under this folder.
- [ ] 4.4 B4 `src/recap/render/`, `src/i18n/`, `src/column/`. Verify: no baseline entry remains under these folders.
- [ ] 4.5 B5 `src/adapters/db/`. Verify: no baseline entry remains under this folder.
- [ ] 4.6 B6 `src/adapters/` except `db/`. Verify: no baseline entry remains under these files.
- [ ] 4.7 B7 `src/daemon/`, `src/extensions/`, `src/compact/`, `src/setup/`, `src/transport/`. Verify: no baseline entry remains.
- [ ] 4.8 B8 `src/experiment/`. Verify: no baseline entry remains under this folder.

## 5. Phase C: the hard gate (lead)

- [ ] 5.1 Remove the thin throwing wrappers kept for cross-lane callers (design Risks). Verify: no exported function throws
      `NotAnIdentifierError`, and the test suite passes.
- [ ] 5.2 Delete `ci/domain-types-baseline.json` and move `recap-one-brand-cast` into the rule set; the check and the rule now
      fail on any finding. Verify: a probe adding one primitive parameter, and one adding `as PaneId`, each fail `ci/lint.sh`.
- [ ] 5.3 Update the module map and Context table in design.md to the final state. Verify: the counts are zero.

## 6. Archive

- [ ] 6.1 Once every other task is checked, run `openspec archive domain-type-gates` in the same merge request as the last task.
      Verify: `openspec validate --specs --strict` passes and `openspec/specs/tab-recap/code-gates/spec.md` exists.
