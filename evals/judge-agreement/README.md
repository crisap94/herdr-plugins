# judge-agreement eval

The expected answers were written by a model and audited by nobody yet.

Measures the tab-recap judge on the task `score` (seven item checks and one section check for every added item, pass or fail) against planted labels, across a ladder of six configurations on the Codex SDK and the Claude Agent SDK. The plugin's own `writerContext`, `scoringDocument`, `RUBRIC_TEXT`, `judgeInstructions('score', new Map())`, `unfenced` and `parseScore` are imported unchanged from `tab-recap/src`; only the transport is the library's (`evals/lib/`). The case, the criteria and the configurations are in `SPEC.md`; the dataset is `dataset.jsonl` (24 mocked runs, 192 added items, written by `build-dataset.ts` from `cases-a.ts` and `cases-b.ts`, checked by `check.ts`).

This is Part A of `SPEC.md`. Part B (the suite's Sonnet judge on its own criteria) is specified in `SPEC.md` section 7 and not built. All criteria of Part A are graded by code. No judge call is made.

## Files

- `prompt.ts`: the item types, `loadItems`, and `prompt(item)`: the system prompt is `judgeInstructions('score', new Map())`, the user message is `scoringDocument({ rubric: RUBRIC_TEXT, input: writerContext(request), items, state })`.
- `scoring.ts`: `grade(item, text)` (J1 the answer parses with `parseScore(unfenced(text), ...)`; J2 all 64 cells; `F_<check>` every must-fail cell of the check judged fail; `P_<check>` every must-pass cell judged pass), the stub answer, and the agreement figures (J3 flipping cells, J4 true-fail and true-pass rates with Wilson 95 % intervals and Cohen's kappa per check, the gate, saturation, the section check by section).
- `judge-criteria.ts`: empty on purpose; Part A has no judge criterion.
- `run.ts`: the `EvalSpec` and the command line.

## Commands

Run from the `evals/` folder of the repository.

- Check the dataset: `bun judge-agreement/check.ts` (ends with `OK`).
- Typecheck: `node_modules/.bin/tsc -p judge-agreement/tsconfig.json` (prints nothing, exits 0).
- Stub run, no model called: `bun judge-agreement/run.ts --stub` (432 stub answers built from the planted labels; every criterion passes and every check agrees; writes `~/.local/state/tab-recap-evals/suite/judge-agreement/runs/stub/`).
- Smoke run, 12 real calls: `bun judge-agreement/run.ts --smoke` (label `smoke`, one repetition, at most 12 calls drawn by the seed across both backends; measures seconds, tokens and cost per call at these document sizes before the full run).
- Full run: `bun judge-agreement/run.ts --label <label>` (24 runs x 6 configurations x 3 repetitions = 432 calls, at most 4 at a time per backend, 600 s timeout per call).
- Resume a run: `bun judge-agreement/run.ts --resume <label>` (same as `--label <label> --retry-failed`; refuses a label with no earlier answers). Rerunning with `--label <label>` also resumes, without re-making failed calls.
- Rescore without calls: `bun judge-agreement/run.ts --label <label> --report-only`.
- Shrink the ladder: `--configs codex-luna-medium,claude-haiku-medium,claude-sonnet-medium,codex-sol-medium,...`; drop `claude-sonnet-high` first, then `codex-luna-low`; never drop an item.

Every flag of `evals/lib/cli.ts` also works (`--reps`, `--items`, `--seed`, `--max-calls`, `--concurrency`, `--retry-failed`, `--report-only`, `--root`). Use a different label for the smoke run and the full run.

## Outputs

`~/.local/state/tab-recap-evals/suite/judge-agreement/runs/<label>/`: `prompt.md`, `answers.jsonl` (raw answers), `run.log`, `results.csv`, `summary.json`, `agreement.csv` (configuration, check, must-fail k and n, must-pass k and n, both Wilson intervals, kappa, missing cells, flipping cells, agrees, saturated), `agreement.json`, `report.md` (the library's report, then a section with the agreement per configuration and check, the saturated checks, the section check by section and every flipping cell).

A check "agrees with the planted labels" only with 20 must-fail and 20 must-pass cells with a verdict, kappa at least 0.6 and both Wilson lower bounds at least 0.70. That is agreement with labels a model wrote, not with the owner.

Both SDKs run on the logins already on this machine. No API key is set or read.
