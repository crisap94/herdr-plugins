# Proposal

## Why

Nothing checks whether a recap item is meaningful. The writer's answer is validated for shape only (JSON,
seven sections, caps, 16 words a line, language, task regrouping). Measured on a live database on
2026-10-07 (206 runs, 2 881 stored items): about 79 % of decisions state no reason, about 10 % of the items
of every section are near-duplicates of another item of the same task, 30–45 % of now / next / needs items
name nothing concrete (no file, command, reference, number or role), and items such as "claude completed
the research and wrote its report" describe the narrator instead of the work. A future reader of those
items — the compaction brief, the expanded view, the operator — gets noise.

The evaluation literature agrees on a shape for fixing this: decompose quality into yes/no checks per
atomic item (CheckEval, FActScore), judge coverage as well as precision (FineSurE), prove a handoff by a
read-back (I-PASS), give a decision its why (decision records), and validate the judge against human labels
before trusting it. This change brings that shape into the plugin, on today's writer, so quality is measured
before the engine changes and the measurement can judge the change.

## What Changes

- A **rubric** file, `tab-recap/schema/recap-rubric.md`: yes/no checks for every item (atomic, stands alone,
  specific, supported by the input, about the work not the narrator, new, still true) and per section, each
  with a pass and a fail example. The writer's instructions quote it.
- **Gates** in plain code on every run, no model call: refuse an item whose subject is an agent, a decision
  without a reason, a link that does not resolve, a duplicate within the same answer, the wrong language;
  flag (count, never refuse) an item naming nothing concrete or opening with a pronoun. Refused items go back
  once as a correction; what is still refused is dropped and the rest kept. The counts are stored per run.
- The **input document of every run is saved**, compressed, for a configurable number of days (default 14), so
  an item can be judged against exactly what the writer saw.
- A **judge** job (`tab-recap eval`): on the harness layer like the other jobs, defaulting to the recap
  writer's harness and model at medium effort, settable in the settings' Models group. It scores sampled runs
  check by check with a one-line critique per failure, extracts the key facts of each input and reports
  coverage and no-filler, and runs a read-back (a fresh call answers six fixed questions from the stored recap
  alone). Verdicts are stored. `eval --label` and `eval --agree` calibrate the judge against the operator's
  own pass/fail labels.

Out of scope: changing how the recap is written (the ledger of facts is the next change); replaying old
transcripts through a new writer (`eval --replay`, with the ledger); any dependency outside the plugin — the
rubric, the judge's instructions and the eval live in the repository and run on the installed agent CLIs.

Merge request label: `changelog::added`. (It ships inside 2.0.0 together with the following changes.)

## Capabilities

### New Capabilities

- `tab-recap/recap-quality`: the rubric, the gates, the stored inputs and verdicts, the judge job and the
  `eval` command.

### Modified Capabilities

- `tab-recap/writer-context`: the instructions quote the rubric, and refused items come back as a correction.
- `tab-recap/state-store`: run inputs, verdicts and gate counts are stored (migration 005).
- `tab-recap/cli`: the `eval` command and its options.

## Impact

`schema/recap-rubric.md` (new), `src/recap/domain/gates/*` (new, pure), `src/recap/application/gatekeeper.ts`,
`recap-ask.ts` (gates before the shape check, correction text), `src/ports/run-inputs.ts`, `src/ports/verdicts.ts`,
`src/adapters/db/{run-inputs,verdicts}.ts`, `schema/005-eval.ts`, `src/recap/application/judge.ts`,
`schema/judge-input.dtd`, `bin/tab-recap.ts` (`eval`), `src/daemon/config.ts` (judge job, retention), the
settings modal (one Models row), en/es, README, tests.
