# moment-decider eval

The expected answers were written by a model and audited by nobody yet.

Measures the autocompact moment decider of tab-recap (six probabilities, then `compact`, `wait` or `undecided` from the plugin's `verdictOf`) across a ladder of eight configurations on the Codex SDK and the Claude Agent SDK. The plugin's own `autocompactState`, `QUESTIONS`, `deciderInstructions`, `probabilitiesOf` and `verdictOf` are imported unchanged from `tab-recap/src`; only the transport is the library's (`evals/lib/`). The case, the criteria and the configurations are in `SPEC.md`; the dataset is `dataset.jsonl` (24 mocked items, written by `build.ts`, checked by `check.ts`).

All criteria are graded by code. No judge call is made.

## Files

- `prompt.ts`: the item types, `loadItems`, and `prompt(item)`: the system prompt is `deciderInstructions(QUESTIONS)`, the user message is `JSON.stringify(autocompactState(recent, history))`.
- `scoring.ts`: `grade(item, text)` (C1 to C6, C2M and one `Q_<id>` per question, through `probabilitiesOf` and `verdictOf`), the stub answer, and the reported-only figures (unsafe compactions with their six probabilities, missed safe moments, verdict stability, undecided rate, Brier score).
- `judge-criteria.ts`: empty on purpose; this eval has no judge criterion.
- `run.ts`: the `EvalSpec` and the command line.

## Commands

Run from the `evals/` folder of the repository.

- Check the dataset: `bun moment-decider/check.ts` (ends with `ok: 24 items`).
- Typecheck: `node_modules/.bin/tsc -p moment-decider/tsconfig.json` (prints nothing, exits 0).
- Stub run, no model called: `bun moment-decider/run.ts --stub` (576 stub answers; every criterion passes; writes `~/.local/state/tab-recap-evals/suite/moment-decider/runs/stub/`).
- Smoke run, 12 real calls: `bun moment-decider/run.ts --smoke` (label `smoke`, one repetition, at most 12 calls drawn by the seed across both backends; measures seconds, tokens and cost per call before the full run).
- Full run: `bun moment-decider/run.ts --label <label>` (24 items x 8 configurations x 3 repetitions = 576 calls, at most 4 at a time per backend).
- Resume a run: `bun moment-decider/run.ts --resume <label>` (same as `--label <label> --retry-failed`; refuses a label with no earlier answers). Rerunning with `--label <label>` also resumes, without re-making failed calls.
- Rescore without calls: `bun moment-decider/run.ts --label <label> --report-only`.
- Shrink the ladder: `--configs codex-sol-low,claude-haiku-low,...`; drop `codex-luna-medium` first, then `claude-sonnet-high`; never drop an item.

Every flag of `evals/lib/cli.ts` also works (`--reps`, `--items`, `--seed`, `--max-calls`, `--concurrency`, `--retry-failed`, `--report-only`). Use a different label for the smoke run and the full run.

## Outputs

`~/.local/state/tab-recap-evals/suite/moment-decider/runs/<label>/`: `prompt.md`, `answers.jsonl` (raw answers), `run.log`, `results.csv`, `summary.json`, `extras.json` (reported-only figures), `report.md` (the library's report, then a section with the unsafe compactions named item by item with their six probabilities, the missed safe moments, verdict stability, undecided rate and Brier score).

Both SDKs run on the logins already on this machine. No API key is set or read.
