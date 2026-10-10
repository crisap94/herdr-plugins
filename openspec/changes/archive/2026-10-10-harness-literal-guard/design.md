# Design

## The rule

`rules/recap-no-harness-literals.yml` matches a `string` node, or a `template_string` with no substitution, whose whole text is one of the harness ids. Strings that merely contain an id (`claude-opus-4-7`, `my codex notes`) and identifiers named after a harness are not matched; the probes pin both. It applies to `src/**` and `bin/**` and ignores `src/adapters/**`, `recap/domain/registered-kinds.ts` and `recap/domain/backend.ts`.

The allow-list is closed on purpose and each entry has a reason. The adapters are where a harness is allowed to be named. The two domain tables are the registries the rest of the code asks: `REGISTERED_KINDS` (the closed kind union and its capability flags) and the job harness registry (`BackendId` and its capability fields). Everything else must ask them (`registeredKindOf`, the capability tables) or import a named constant from the owning adapter.

## The three offenders and their fixes

The rule found four literals in three files, all under `bin/`; `src/` was already clean.

- `bin/replay.ts` inferred the default kind from the transcript path (`.codex` directory means Codex, otherwise Claude). That inference is Codex and Claude knowledge, so it moves into the reader registry module as `replayKindOf(flag, file)`, which parses the flag with `readerKindOf` exactly as before. Result for every input is unchanged.
- `bin/autocompact-briefs.ts` builds a compaction input for the Claude transcripts it replays. It now imports `CLAUDE_KIND` from the Claude transcript adapter, where the reader's own `agent` is defined from the same constant (one source of truth, typed as a registered kind).
- `bin/autocompact-label.ts` runs the Codex program to report its version. The program name is Codex adapter knowledge: the adapter exports `CODEX_PROGRAM` and uses it where it starts the program, and the tool imports the same constant.

## Alternatives considered

- Allow-list the research tools under `bin/`: rejected, it widens the boundary to silence a finding and the facts have a natural owner.
- Match identifiers and types as well as literals: rejected, the closed kind union already makes those compiler-checked.
- Keep the id list only in the rule: rejected, it would drift from the registries. A test compares the rule's list with the ids derived from the registries.

## Standards

Domain-driven design: the harness ids stay in the registry tables that define the ubiquitous language (`REGISTERED_KINDS`, the job harness registry) and in the adapters; the rule is the anti-corruption boundary that keeps them from leaking inward. SOLID: open/closed (a new harness is an adapter plus registry entries; the rule needs only its id list updated, enforced by the drift test), dependency inversion (the core asks the registries; the existing layer rules and this one together keep adapters depending inward). DRY: each id has one defining place; the three moved facts get one exported constant or function each, used by the tool and the adapter alike; the rule's list is checked against the registries instead of being a second hand-kept list. Conformance and boundary tests: the rule's own probes (bite and no over-reach), the id-drift test, and a unit test of `replayKindOf` for every default and flag case.

## Verification

`ci/lint.sh` fails on the rule if any literal remains; the drift test fails when the rule and the registries disagree; a mutation (a `'claude'` literal in a core file) is shown to fail lint.
