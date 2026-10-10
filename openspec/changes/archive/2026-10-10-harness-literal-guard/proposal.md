# Proposal

## Why

Every harness-specific fact now lives in an adapter or in a registry table keyed by the registered kinds. Nothing stops a later change from writing `'claude'` or `'codex'` in the core again, which silently re-creates the branch-on-harness code the registries replaced. A rule that fails lint on such a literal keeps the boundary in place without relying on review memory.

## What Changes

- Add the ast-grep rule `recap-no-harness-literals`: it reports a string literal that equals a harness id (`claude`, `codex`, `opencode`, `hermes`, `custom`) in `src/` or `bin/`, except in the adapters and the job harness registry (`backend.ts`); the registered kinds are declared as identifiers, which the rule does not match, so `registered-kinds.ts` needs no exception. Probes (`bad.ts`, `good.ts`) prove it bites and does not over-reach; `ci/lint.sh` already runs every rule with its probes.
- Remove the three literals the rule found outside the allow-list, all in `bin/`, by naming each fact in the adapter that owns it:
  - replay's default kind inferred from the transcript path becomes a function of the reader registry module (`replayKindOf`);
  - the research briefs tool takes the Claude kind from the Claude transcript adapter (`CLAUDE_KIND`);
  - the label tool takes the Codex program name from the Codex harness adapter (`CODEX_PROGRAM`).
- Add a test that fails when either alternation of the rule's list of harness ids (the string branch and the template branch) differs from the ids in the registries, so a new harness cannot be added without updating the guard.

## Out of scope

- No behaviour change anywhere: every moved value is identical; replay and the research tools read and write exactly what they did.
- The rule looks at string literals only. It does not follow ids built from templates or concatenation, and it does not scan tests (a test may name a harness to pin its behaviour).
- No allow-list entry beyond the adapters and the job harness registry.

## Changelog

This change lands on main through a merge request labelled `changelog::internal`: it changes no shipped behaviour.
