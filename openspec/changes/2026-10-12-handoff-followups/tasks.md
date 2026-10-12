# Tasks

Paths are under `tab-recap/`. One merge request carries all groups.

## 1. Tests and mapping

- [x] 1.1 A repeated closed-source option is a named usage error, pinned by a test in `test/handoff-arguments.test.ts`.
- [x] 1.2 One mapping from a source resolution to its refusal (`unfoundOutcome` in `src/recap/application/handoff-source.ts`) serves the delivery flow and `--print`.

## 2. Logging and typing

- [x] 2.1 `--print` takes a logger; an unreadable closed source logs `handoff print: source unreadable (<cause>)`, code only, pinned by a test in `test/handoff-print.test.ts`.
- [x] 2.2 `Unknowable` details are typed `FailureCause`; producers name their cause through `causeOf` or `failureCauseOf`.

## 3. Archive

- [ ] 3.1 Archive the change in its own merge request, after the checks pass.
