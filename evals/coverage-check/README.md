# coverage-check eval

Measures the coverage decider of tab-recap: given a compaction brief and the open facts of a lane, does each configuration answer, per fact, a probability on the right side of the plugin's pass mark 0.70? See `SPEC.md` for the job, the dataset and the criteria.

The expected answers were written by a model and audited by nobody yet.

## What runs

- Prompt: the plugin's own `factsOf`, `questionsFor` and `deciderInstructions`, imported unchanged from `tab-recap/src`; the user text is `JSON.stringify({ brief, facts })` exactly as `covered()` builds it (`prompt.ts`).
- Grading: the plugin's own `probabilitiesOf` and `missingOf` at `KEPT_AT_LEAST` (`scoring.ts`). Criteria C1 to C8b are code; there is no judge (`judge-criteria.ts` is empty on purpose).
- Transport: `evals/lib/` (Claude Agent SDK and Codex SDK on the logins of this machine, no API key).
- Configurations: six, `claude-haiku-low` (shipped) first, 180 s timeout each (`spec.ts`).

## Commands

Run from `evals/`:

~~~~sh
node_modules/.bin/tsc -p coverage-check/tsconfig.json
bun coverage-check/dataset/check.ts
bun coverage-check/check-scoring.ts
bun coverage-check/run.ts --stub
~~~~

The stub run makes no model call and writes to `$HOME/.local/state/tab-recap-evals/suite/coverage-check/runs/stub/`.

Real runs (they call the models):

~~~~sh
bun coverage-check/run.ts --smoke --label smoke-2026-11-13
bun coverage-check/run.ts --label full-2026-11-13
bun coverage-check/run.ts --label full-2026-11-13 --resume
bun coverage-check/run.ts --label full-2026-11-13 --report-only
~~~~

- `--smoke`: 2 items (`cc-01`, `cc-21`) x 6 configurations x 1 repetition = 12 calls. Label defaults to `smoke`.
- `--label L`: required for a real run. A label that already holds answers is refused unless `--resume` or `--report-only` is given.
- `--resume`: continues the run of that label; recorded calls are never repeated, and calls that ended in timeout, rate limit or failure are made again.
- `--report-only`: rescores from the recorded answers, no call.
- Every flag of `evals/lib/cli.ts` passes through: `--configs a,b`, `--reps N`, `--items N`, `--seed N`, `--max-calls N`, `--concurrency N`, `--retry-failed`.

Full run: 24 items x 6 configurations x 3 repetitions = 432 calls, no judge call.

## Outputs

In `$HOME/.local/state/tab-recap-evals/suite/coverage-check/runs/<label>/`:

- `answers.jsonl`: every raw answer with tokens, cost, latency and failure kind.
- `results.csv`, `summary.json`, `report.md`: the library's per-answer marks, summary and report.
- `questions.csv`: one row per question and answer (id, config, repetition, question, how, expected_kept, probability, right).
- `question-summary.json`: the sweep, AUC, confident wrong answers and C7 flips behind the question-level section appended to `report.md`.
- `prompt.md`, `run.log`.
