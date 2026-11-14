# curator-story

Eval of the curator in story mode: the call the plugin makes when the expanded view opens on a changed task. What is measured, and why, is in `SPEC.md`.

The expected answers were written by a model and audited by nobody yet.

## Files

| File | What |
|---|---|
| `prompt.ts` | loads `dataset.jsonl`; builds the system prompt (`CURATOR_INSTRUCTIONS`) and the user message (`curatorInput({ ...input, rubric: RUBRIC.items }).document`) with the plugin's own code |
| `scoring.ts` | the code criteria S1 to S11 on the raw answer, through the plugin's `unfenced`, `curationOf`, `storyOf`, `STORY_WORDS` and `languageOfLine` |
| `judge-criteria.ts` | the judge criteria SJ1 to SJ3 and what the judge sees: the document without `<rubric>`, the notes for SJ2 and SJ3, the story |
| `run.ts` | the run: dataset, ladder, repetitions, the library's runner, judge, statistics and report |
| `tsconfig.json` | the typecheck of this folder |

## Run

Every command runs from `evals/`.

| What | Command |
|---|---|
| Stub run, no model called (432 stub answers, stub judge) | `bun curator-story/run.ts --stub` |
| Smoke run: 2 items (cs-07, cs-22) x 6 configurations x 1 repetition = 12 calls, at most 12 judge calls | `bun curator-story/run.ts --smoke` (label `smoke`) |
| Full run: 24 items x 6 configurations x 3 repetitions = 432 calls, at most 432 judge calls | `bun curator-story/run.ts --label <label>` |
| Resume a run that stopped | `bun curator-story/run.ts --resume --label <label>` (the same command without `--resume` also resumes; `--resume` refuses a label that has no answers yet) |
| Rescore without a call | `bun curator-story/run.ts --report-only --label <label>` |
| Typecheck | `node_modules/.bin/tsc -p curator-story/tsconfig.json` |
| Dataset check | `bun curator-story/check-dataset.ts` |

The library's flags also work: `--configs a,b`, `--reps N`, `--items N`, `--seed N`, `--max-calls N`, `--max-judge-calls N`, `--concurrency N`, `--retry-failed`, `--judge-check file.json`. `--smoke` sets the items and the repetitions itself and refuses `--items` and `--reps`.

Both SDKs run on the logins already on this machine. No API key is read or set.

## Output

`$HOME/.local/state/tab-recap-evals/suite/curator-story/runs/<label>/`, never in the repository:

| File | What |
|---|---|
| `prompt.md` | the system prompt and the user message of the first item, and the sha256 of all prompts |
| `answers.jsonl` | every raw answer with tokens, cost where the SDK reports it, and time |
| `judge.jsonl` | every judge verdict with its evidence |
| `results.csv` | one row per answer, one 1/0/empty column per criterion |
| `summary.json` | the numbers of the report |
| `report.md` | decision, criteria per configuration with Wilson intervals, the paired comparison with the shipped configuration, calls, tokens, cost, time, and what the run can and cannot show |
| `s11-tokens.md` | the tokens S11 found outside the ledger, per answer; read them before calling a fail a breach |
| `run.log` | the log |

## Reading the results

- An empty mark means the criterion does not apply to that answer (S5 with no sentence the language gate can call, S7, S8, S9 and SJ3 outside their items, S3, S4, S5 and S11 when there is no story) or that the call or the judge failed. The report counts both in the missing column.
- SJ1 to SJ3 are "judge, not validated" until `evals/judge-agreement` Part B gives them a Wilson lower bound of 0.70; pass `--judge-check` with that result to mark them validated.
- On `claude-sonnet-medium` and `claude-sonnet-high` the judge grades its own model.
