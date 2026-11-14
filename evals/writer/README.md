# writer eval

The expected answers were written by a model and audited by nobody yet.

Measures the recap writer of tab-recap (one writer input in, `{"ops":[…]}` out) across a ladder of six configurations on the Codex SDK and the Claude Agent SDK. The plugin's own `instructions`, `writerContext`, `unfenced`, `parseAnswer`, `LEDGER_GATES`, `judge` and `apply` are imported unchanged from `tab-recap/src`; only the transport is the library's (`evals/lib/`). The case, the criteria and the configurations are in `SPEC.md`; the dataset is `dataset.jsonl` (24 mocked items, written by `build-dataset.ts`, checked by `check-dataset.ts`).

Code graders decide W1 to W13b. The judge (`claude-sonnet-5-5`, medium effort, blind to the configuration) decides WJ1 to WJ4 in one call per answer. Every judge criterion prints as "judge, not validated" until `evals/judge-agreement` part B has checked it and its result is passed with `--judge-check <file>`.

## Files

- `prompt.ts`: the item types, `loadItems`, and `prompt(item)`: the system prompt is `instructions(request)`, the user message is `writerContext(request, TRANSCRIPT_BUDGET)`.
- `scoring.ts`: the gate ground built from the item alone (`groundOf`, as in `check-dataset.ts`), `grade(item, text)` (W1 to W13b through `parseAnswer`, `judge(LEDGER_GATES, …)` and `apply`), which judge criteria apply to an answer, the judge view, the stub answer, and the reported-only figures (refusals by gate, rejected answers, the W13b rewrite count).
- `judge-criteria.ts`: WJ1 to WJ4 with the exact questions of `SPEC.md` and what counts as a breach.
- `run.ts`: the `EvalSpec` and the command line. It runs the library's steps in the library's order and adds one: a judge criterion that does not apply to an answer (WJ1 on a quiet item, WJ2 to WJ4 when nothing is kept) is scored outside n, and an answer to which no judge criterion applies gets no judge call.

## Commands

Run from the `evals/` folder of the repository.

- Check the dataset: `bun writer/check-dataset.ts`.
- Typecheck: `node_modules/.bin/tsc -p writer/tsconfig.json` (prints nothing, exits 0).
- Stub run, no model called: `bun writer/run.ts --stub` (432 stub answers and 342 stub judge calls; every code criterion passes; the stub judge fails about one criterion in four on purpose; writes `~/.local/state/tab-recap-evals/suite/writer/runs/stub/`).
- Smoke run, 12 real writer calls and at most 12 judge calls: `bun writer/run.ts --smoke` (label `smoke`, one repetition, calls drawn by the seed across both backends; measures seconds, tokens and cost per call before the full run).
- Full run: `bun writer/run.ts --label <label>` (24 items x 6 configurations x 3 repetitions = 432 writer calls, at most 432 judge calls, at most 4 at a time per backend).
- Resume a run: `bun writer/run.ts --resume <label>` (same as `--label <label> --retry-failed`; refuses a label with no earlier answers). Rerunning with `--label <label>` also resumes, without re-making failed calls.
- Rescore without calls: `bun writer/run.ts --label <label> --report-only`.
- Shrink the ladder: `--configs codex-luna-medium,claude-haiku-medium,...`; never drop an item.

Every flag of `evals/lib/cli.ts` also works (`--reps`, `--items`, `--seed`, `--max-calls`, `--max-judge-calls`, `--concurrency`, `--retry-failed`, `--report-only`, `--judge-check`, `--root`). Use a different label for the smoke run and the full run.

## Outputs

`~/.local/state/tab-recap-evals/suite/writer/runs/<label>/`: `prompt.md`, `answers.jsonl` (raw writer answers), `judge.jsonl` (raw judge verdicts with evidence), `run.log`, `results.csv`, `summary.json`, `extras.json`, `report.md` (the library's report, then a section with refusals by gate, the answers the parser rejected, and the facts rewritten after a language change).

Both SDKs run on the logins already on this machine. No API key is set or read.
