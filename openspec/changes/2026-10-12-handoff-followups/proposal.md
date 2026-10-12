# Proposal: the handoff follow-ups

## Why

The merged handoff work left four small gaps: a repeated closed-source option was refused by the code but not pinned by a test, the source-resolution refusals were written twice (in the delivery flow and in `--print`), a `--print` of an unreadable closed source failed silently, and the unreadable-cause detail was a plain string for older producers.

## What changes

- **lane-handoff** (added): a printed closed source that cannot be read logs its cause, code only, to standard error.
- **cli** (added): a repeated closed-source option is a usage error, named as such.
- Code (no requirement changes): one shared mapping from a source resolution to its refusal, used by the delivery flow and by `--print`; the print path takes a logger; `Unknowable` details are typed as failure causes, and every producer names its cause through `causeOf` or `failureCauseOf`.

## Out of scope

Producers that still pass runtime text (transport errors, subprocess output) keep their wording under `causeOf`; moving them to `failureCauseOf` changes what the operator sees and is tracked separately.
