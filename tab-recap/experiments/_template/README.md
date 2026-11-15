# EXP-NNN · <question as a title>

| Field | Value |
|---|---|
| Status | planned / running / concluded |
| Decision | adopt / iterate / drop / inconclusive — one sentence |
| Owner | |
| Dates | start → end |
| Parent | OpenSpec change, lever or issue this serves |
| Links | MRs, artifact, ADR |

## Question and hypothesis

The question in one sentence. Each hypothesis states the result that would confirm it and the result that would refute it.

## Method

- **Corpus:** what the cases are, where they come from, and how many of them there are, per kind.
- **Candidates:** what is compared, including the control and the baselines.
- **Metrics:** the primary metric, the secondary metrics, and the guardrails.
- **Environment:** where it runs, the limits, and the isolation.
- **Decision rule:** written before the results.

## Runs

| Run | Status | What changed | Outcome |
|---|---|---|---|

## Results

Tables per segment, never pooled across segments that behave differently.

## Anomalies and threats to validity

Bugs found, biases, small samples, and anything that limits what the numbers can claim.

## Interpretation and decision

What the evidence supports, what it does not, and the decision with its reason.

## Next steps

## Reproducibility checklist

- [ ] Code commit recorded for every run
- [ ] Corpus versioned and hashed
- [ ] Container images pinned by digest or checksum
- [ ] Exact commands in every `run.yaml`
- [ ] Resource limits and host recorded
- [ ] Raw outputs kept, not only summaries
- [ ] Invalid runs kept and explained
- [ ] Known limitations stated
