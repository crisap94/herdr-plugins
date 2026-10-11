# Tasks: domain types in every signature

Phase A is done by the maintainer lead in one merge request and lands first. Phase B lanes run in parallel after it (design
"Phases and order"); each edits only the files `ci/lanes.json` gives it. Phase C is done by the lead after every lane has
landed. Every group ends with the plugin gates passing (`bash ci/lint.sh` and `bash ci/test.sh`, from `tab-recap/`).

## 1. Phase A: vocabulary and tools (lead)

- [ ] 1.1 Add the nouns `domain type`, `parser`, `type guard`, `edge`, `exception`, `lane` and `legacy export` to
      `tab-recap/CONTEXT.md` before any code; every noun a lane needs later goes through the lead. Verify: the vocabulary step of
      `ci/lint.sh` passes.
- [ ] 1.2 Add `typescript` (pinned to an exact 6.x release, not 7) and `dependency-cruiser` (exact version) to `devDependencies`;
      `dependencies` stays absent. Verify: `package.json` has no `dependencies` field, `npm ci` passes, and `node -e
      "require('typescript').version"` prints a 6.x version.
- [ ] 1.3 The shared vocabulary every lane needs before it starts: the parser signature, the common text, count and duration value
      types and the ids, each with its `parse<Name>` returning the one `Result`, in `src/recap/domain/`. Verify: each has a parser test
      and passes the signature check.
- [ ] 1.4 `src/recap/domain/brand.ts` exports the one brand function; its carrier parameter is entry 3 of the exception class
      (design D2). Verify: the exception test holds exactly that entry for `brand.ts`.

## 2. Phase A: the module graph (lead)

- [ ] 2.1 `tab-recap/.dependency-cruiser.cjs` with `options.tsPreCompilationDeps: true` and the rules of design D5 (domain purity,
      gates purity, no input or output in application, render and i18n, protocol self-contained, exchanges, transport boundary,
      `brand.ts` importers, no cycles, no orphans, `not-to-unresolvable`), wired into `ci/lint.sh`. Verify: the tree passes.
- [ ] 2.2 Prove `#src/*` resolution in a fixture with its own `package.json` `imports` and `src/` layout: a domain file importing
      `#src/adapters/db/connection.ts` fails the allow-list rule, and a file outside the fleet adapter importing
      `#src/transport/...` fails the forbid-style transport rule. Verify: both probes fail with the path named.
- [ ] 2.3 A bad and a good fixture folder per rule of 2.1, each with its own `package.json` and `src/` layout, and for every import
      rule one bad fixture whose violation is an `import type`. Verify: `ci/lint.sh` fails on each bad fixture and passes on each good.
- [ ] 2.4 A module-count guard: `ci/lint.sh` fails when the cruise reports fewer modules than `find src bin -name '*.ts'`.
      Verify: a probe run with the transpiler made unavailable fails the guard.
- [ ] 2.5 Retire `recap-domain-pure`, `recap-domain-pure-gates`, `recap-layers-no-io`, `recap-protocol-self-contained`,
      `recap-protocol-exchanges-self-contained` and `recap-transport-boundary` with their probes, in the same merge request as 2.1,
      and update the places that name them: the red-lines table in `tab-recap/CLAUDE.md`, `CONTRIBUTING.md` (lint step and the layered
      paragraph), and `openspec/changes/lane-handoff-retention/tasks.md` (its boundary-probe task names `recap-domain-pure`). Verify:
      `grep -rn` for the six names outside `openspec/changes/archive/` finds only this change.

## 3. Phase A: the type gates and the ratchet (lead)

- [ ] 3.1 `bin/check-domain-types.ts` per design D1, with `--project <tsconfig>`, the `not supported:` message, properties of
      declared types, type parameter constraints, and inferred library callback parameters skipped. Verify: a bad probe folder per case
      fails (parameter, return, arrow function, method, constructor, annotated callback type, array, `Promise`, `Record`, anonymous
      object-literal type, interface with a primitive field, alias of a primitive, hand-rolled brand `string & { readonly tag: 1 }`,
      `<T extends string>`, `unknown` outside a parser) and a good probe folder per allowed form passes, including an unannotated
      `.map` callback over a library array and a type guard in the value's own file.
- [ ] 3.2 Per-lane exception files keyed by file, function and parameter or return, with the three classes of design D2 (callbacks;
      each released migration file by name, derived from the latest `tab-recap-v*` tag as `ci/check-migrations.sh` derives it;
      `brand.ts`). Verify: a probe adding an entry that no finding hits fails; a probe removing a needed entry fails; a new migration
      file with a primitive helper fails.
- [ ] 3.3 `recap-brand-in-own-parser` and `recap-one-brand-cast` (both `as` other than `as const` and the angle-bracket form), the
      latter in `rules/pending/`, with `ci/lint.sh` running its probes there. Verify: a bad probe calling `brand(raw, 'PaneId')` from
      `src/recap/application/` fails the first rule; a bad `<PaneId>raw` and a bad `raw as PaneId` fail the second; good probes pass.
- [ ] 3.4 `recap-no-suppression` (design D4) in `rules/`, and oxlint's `typescript/no-unsafe-assignment`, `no-unsafe-argument`,
      `no-unsafe-return` and `no-unsafe-member-access` turned on. Verify: a bad probe with `// @ts-ignore` in `src/` fails, the same in
      `test/` passes; a bad probe `const id: PaneId = JSON.parse(text)` fails oxlint.
- [ ] 3.5 The ratchet of design D6: per-lane baseline files with one count per category per file, written from the tree; the check
      fails above and below an entry and on a file without one; `ci/check-domain-baseline.sh` compares every baseline file with the
      merge base and is wired into CI. Verify: a probe adding a finding to a counted file fails; a probe fixing one finding without
      lowering the entry fails as stale; a probe fixing an assertion and adding a parameter in the same file fails; a probe raising an
      entry, and one adding a new entry, each fail the merge-base guard.
- [ ] 3.6 `ci/lanes.json` and its test (design D8), and a per-lane CI check that a merge request edits only its lane's files.
      Verify: a probe listing a file twice fails; a probe missing a file fails; a lane merge request touching another lane's file fails.
- [ ] 3.7 Record in design.md's Context table the exact counts from the check, per category, and the run times of the check and the
      cruise. If both together add 60 seconds or more to `ci/lint.sh`, move the check to its own CI job. Verify: the row is replaced
      and, if needed, the CI job exists.
- [ ] 3.8 `CONTRIBUTING.md` gains a section on domain types: what the check refuses, where parsers live, how to read a
      `not supported:` line, that exceptions are per symbol and never per file or folder, and how lanes and legacy exports work.
      Verify: the section exists and names the check's command.

## 4. Phase B: one lane per module (parallel)

Each lane converts its signatures and the properties of its declared types to domain types, turns its throwing constructors into
parsers, removes its type assertions, moves any old export still used by another lane into its own `legacy.ts` (design D7), and
lowers its baseline file. It edits only its `ci/lanes.json` files, its `legacy.ts`, its baseline and its exception file.

- [ ] 4.1 B1 `src/protocol/`, `src/ports/`. Verify: B1's baseline holds only `legacy` counts.
- [ ] 4.2 B2 `src/recap/domain/` (gates included), including the throwing constructors of `ids.ts`, whose wrappers move to
      `src/recap/domain/legacy.ts`. Verify: B2's baseline holds only `legacy` counts.
- [ ] 4.3 B3 `src/recap/application/`. Verify: B3's baseline holds only `legacy` counts.
- [ ] 4.4 B4 `src/recap/render/`, `src/i18n/`, `src/column/`. Verify: B4's baseline holds only `legacy` counts.
- [ ] 4.5 B5 `src/adapters/db/`; the released migrations stay listed as exceptions. Verify: B5's baseline holds only `legacy`
      counts.
- [ ] 4.6 B6 `src/adapters/` except `db/`. Verify: B6's baseline holds only `legacy` counts.
- [ ] 4.7 B7 `src/daemon/`, `src/extensions/`, `src/compact/`, `src/setup/`, `src/transport/`. Verify: B7's baseline holds only
      `legacy` counts.
- [ ] 4.8 B8 `src/experiment/`. Verify: B8's baseline holds only `legacy` counts.

## 5. Phase C: the hard gate (lead)

- [ ] 5.1 Move every remaining caller off the legacy exports and delete every `legacy.ts`. Verify: no `legacy.ts` exists under
      `src/`, no exported function throws `NotAnIdentifierError`, and the test suite passes.
- [ ] 5.2 Move `recap-one-brand-cast` from `rules/pending/` into `rules/` and delete `ci/domain-types-baseline/`; the check and the
      rule now fail on any finding. Verify: a probe adding one primitive parameter, and one adding `as PaneId`, each fail
      `ci/lint.sh`.
- [ ] 5.3 Update the module map and the Context table in design.md to the final state. Verify: every count is zero except the
      listed exceptions.

## 6. Archive

- [ ] 6.1 Once every other task is checked, run `openspec archive domain-type-gates` in the same merge request as the last task.
      Verify: `openspec validate --specs --strict` passes and `openspec/specs/tab-recap/code-gates/spec.md` exists.
