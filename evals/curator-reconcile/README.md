# curator-reconcile eval

The expected answers were written by a model and audited by nobody yet.

Measures the curator of tab-recap in reconcile mode (one task's open facts and its newest turns in; close or update operations, each with a quote, out) across a ladder of six configurations on the Codex SDK and the Claude Agent SDK. The plugin's own `reconcileInput`, `RUBRIC`, `RECONCILE_CURATOR_INSTRUCTIONS`, `unfenced`, `reconciliationOf`, `judge(LEDGER_GATES, ...)` and `quotedIn` are imported unchanged from `tab-recap/src`; only the transport is the library's (`evals/lib/`). The case, the criteria and the configurations are in `SPEC.md`; the dataset is `dataset.jsonl` (24 mocked items, written by `build-dataset.ts`, checked by `check-dataset.ts`).

Code grades R1 to R8. The judge (`claude-sonnet-5-5` through the Claude Agent SDK, blind to the configuration) grades RJ1 once per parsed answer; RJ1 is judge, not validated.

## Files

- `prompt.ts`: the item types, `loadItems`, `builtOf(item)` (the plugin's `reconcileInput` with `RUBRIC.items`), `groundOf(item)` (the gate ground as `reconcileTask` builds it), and `prompt(item)`: the system prompt is `RECONCILE_CURATOR_INSTRUCTIONS`, the user message is the built document.
- `scoring.ts`: `checkedOf` (the parser and the gates on the raw answer, and the kept operations with their quotes), `grade(item, text)` (R1 to R8), the stub answer (the expected answer), the judge view, and the reported-only figures (still-true facts closed and summary quotes named item by item, stale facts left open, kept operations per answer, refusals by reason and by gate, flags by gate).
- `judge-criteria.ts`: RJ1.
- `run.ts`: the `EvalSpec` and the command line.

## Commands

Run from the `evals/` folder of the repository.

- Check the dataset: `bun curator-reconcile/check-dataset.ts` (ends with `ok: every item parses, ...`).
- Typecheck: `node_modules/.bin/tsc -p curator-reconcile/tsconfig.json` (prints nothing, exits 0).
- Stub run, no model called: `bun curator-reconcile/run.ts --stub` (432 stub answers and 432 stub judge verdicts; every code criterion passes; writes `~/.local/state/tab-recap-evals/suite/curator-reconcile/runs/stub/`).
- Smoke run: `bun curator-reconcile/run.ts --smoke` (label `smoke`, one repetition, at most 12 job calls drawn by the seed across both backends, then at most 12 judge calls; measures seconds, tokens and cost per call before the full run).
- Full run: `bun curator-reconcile/run.ts --label <label>` (24 items x 6 configurations x 3 repetitions = 432 job calls, at most 432 judge calls, at most 4 at a time per backend).
- Resume a run: `bun curator-reconcile/run.ts --resume <label>` (same as `--label <label> --retry-failed`; refuses a label with no earlier answers). Rerunning with `--label <label>` also resumes, without re-making failed calls.
- Rescore without calls: `bun curator-reconcile/run.ts --label <label> --report-only`.
- Shrink the ladder if the run does not fit the time: `--configs codex-luna-medium,claude-haiku-medium,claude-sonnet-medium,codex-luna-low,codex-sol-medium` drops `claude-sonnet-high`; drop `codex-luna-low` next; never drop an item.

Every flag of `evals/lib/cli.ts` also works (`--reps`, `--items`, `--seed`, `--max-calls`, `--max-judge-calls`, `--concurrency`, `--retry-failed`, `--report-only`, `--judge-check`). Use a different label for the smoke run and the full run.

## Outputs

`~/.local/state/tab-recap-evals/suite/curator-reconcile/runs/<label>/`: `prompt.md`, `answers.jsonl` (raw answers), `judge.jsonl` (raw verdicts), `run.log`, `results.csv`, `summary.json`, `extras.json` (reported-only figures), `report.md` (the library's report, then a section with every still-true fact closed and every summary quote named item by item, the stale facts left open, and per configuration the kept operations, refusals and flags).

Both SDKs run on the logins already on this machine. No API key is set or read.
