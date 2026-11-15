# compaction-brief eval

The expected answers were written by a model and audited by nobody yet.

Measures the compaction brief of tab-recap (the instructions an agent reads before it compacts its conversation) across a ladder of six configurations on the Codex SDK and the Claude Agent SDK. The plugin's own `BRIEF_INSTRUCTIONS`, `compactionInput`, `unfenced`, `vetted` and `refusedIn` are imported unchanged from `tab-recap/src`; only the transport is the library's (`evals/lib/`). The case, the criteria and the configurations are in `SPEC.md`; the dataset is `dataset.jsonl` (24 mocked items, written by `dataset-source/build.ts`, checked by `check.ts`).

Code grades B1 to B7. The judge (`claude-sonnet-5-5`, effort medium, blind to the configuration) grades BJ1 to BJ5 on every answer the plugin's gate accepts; until `judge-agreement` part B checks them, the report prints them as "judge, not validated".

## Files

- `prompt.ts`: the item types, `loadItems`, and `prompt(item)`: the system prompt is `BRIEF_INSTRUCTIONS`, the user message is `compactionInput(item.input)`.
- `scoring.ts`: `grade(item, text)` (B1 to B7 on `unfenced(text)`, through the plugin's `vetted` and `refusedIn` and the checks of `checks.ts`), `view(item, text)` (what the judge sees), the stub answer, and the reported-only figures.
- `judge-criteria.ts`: BJ1 to BJ5, each with its exact question and what counts as a breach.
- `run.ts`: the `EvalSpec` and the command line.
- `checks.ts`: `ownOf` and the code checks the plugin does not export (written with the dataset).

An empty answer fails every code criterion. An answer the gate refuses fails B1 and B2, keeps its marks on B3 to B7 and gets no judge call. The library prints that answer as a fail on every judge criterion, while `SPEC.md` counts it missing; the last section of `report.md` gives the judge rates over usable answers only.

## Commands

Run from the `evals/` folder of the repository.

- Check the dataset: `bun compaction-brief/check.ts` (ends with `ok: 24 items checked`).
- Typecheck: `node_modules/.bin/tsc -p compaction-brief/tsconfig.json` (prints nothing, exits 0).
- Stub run, no model called: `bun compaction-brief/run.ts --stub` (432 stub answers and 432 stub judge verdicts; writes `~/.local/state/tab-recap-evals/suite/compaction-brief/runs/stub/`). B1 to B5 and B7 pass on every answer; B6 fails on cb-22 to cb-24, whose stub brief repeats the Spanish and Portuguese facts; the stub judge fails about a quarter of the judge marks on purpose.
- Smoke run, real calls: `bun compaction-brief/run.ts --smoke` (label `smoke`, one repetition, at most 12 job calls drawn by the seed across both backends and at most 12 judge calls; measures seconds, tokens and cost per call at these document sizes before the full run).
- Full run: `bun compaction-brief/run.ts --label <label>` (24 items x 6 configurations x 3 repetitions = 432 job calls and at most 432 judge calls, at most 4 at a time per backend).
- Resume a run: `bun compaction-brief/run.ts --resume <label>` (same as `--label <label> --retry-failed`; refuses a label with no earlier answers). Rerunning with `--label <label>` also resumes, without re-making failed calls.
- Rescore without calls: `bun compaction-brief/run.ts --label <label> --report-only`.
- Shrink the ladder: `--configs codex-sol-medium,claude-haiku-medium,...`; drop `codex-luna-low` first, then `claude-sonnet-high`; never drop an item.

Every flag of `evals/lib/cli.ts` also works (`--reps`, `--items`, `--seed`, `--max-calls`, `--max-judge-calls`, `--concurrency`, `--retry-failed`, `--report-only`, `--judge-check`). Use a different label for the smoke run and the full run.

## Outputs

`~/.local/state/tab-recap-evals/suite/compaction-brief/runs/<label>/`: `prompt.md`, `answers.jsonl` (raw answers), `judge.jsonl` (raw verdicts), `run.log`, `results.csv`, `summary.json`, `extras.json` (reported-only figures), `report.md` (the library's report, then a section with characters per brief, refusals and the refused words, briefs over the limit and cut by the gate, cb-21 reported apart, the long ledgers (B4 against BJ1), invented paths on the bait items, and the judge rates over usable answers).

Both SDKs run on the logins already on this machine. No API key is set or read.
