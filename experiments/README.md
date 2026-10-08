# Experiments

Each experiment answers one question with measurements and ends in a decision. This folder is the lab notebook: what we asked, how we measured, what came out (including runs that turned out to be wrong) and what we decided.

| ID | Question | Status | Decision | Code and raw runs |
|---|---|---|---|---|
| [EXP-001](EXP-001-recall-engine/README.md) | Which steps of the 2.1 recall engine (state ruler, anchors and gates, enumeration, ask-back, reconciliation) raise what a recap recalls, at what cost? | concluded | the ruler and the anchors with the gates stay; enumeration and ask-back did not move coverage or the read-back beyond the gated single call at 2.4–2.8× the calls, so the default pipeline is the single call and the steps stay behind a switch | code on `main` (2.1.0); raw outputs on the private branch, see the folder's `REMOVED-ON-MAIN.txt` |

## Conventions

- **One folder per experiment:** `EXP-NNN-<slug>/`, with an experiment record in `README.md` built from [`_template/README.md`](_template/README.md). Every record has the same fields, so records stay comparable.
- **Decision first:** the record opens with its status and decision (adopt, iterate, drop, inconclusive). The evidence follows.
- **Pre-registration:** `PREREG.md` holds the question, the metrics and the decision rule, frozen before the first run that counts. Here it usually quotes the OpenSpec design that fixed them.
- **One folder per run:** `runs/RNN-<slug>/`. A run is one invocation, and it holds:
  - `run.yaml`: the id, the status (`valid`, `invalid` or `superseded`), the code commit, the exact command and a note;
  - `summary.md`: the numbers, and only the numbers;
  - the raw output, when it may be published.
- **Runs are never deleted.** A run found to be wrong stays, marked `invalid` with the reason and the run that supersedes it.
- **Provenance:** `manifest.yaml` per experiment records the code commits, the corpus file and its SHA-256, the models and their effort, the host and its limits. A number with no provenance does not count.
- **What stays private.** This repository is public. A corpus made of real terminal sessions, and every raw output that quotes it, is never committed to `main`; it lives on the private branch and `REMOVED-ON-MAIN.txt` lists each file with its size, reason and `branch@commit`. The record on `main` carries every number, so the decision can be checked without the raw text.
- **Reproducibility checklist:** each record ends with one, adapted from the NeurIPS reproducibility checklist and ACM artifact evaluation.

The conventions follow the experiment-record fields product experimentation logs use (hypothesis, metrics, guardrails, results, decision, next steps) with decision-first summaries, logging of code commit, data version, environment, configuration, metrics and artifacts per run, and the reproducibility checklists of NeurIPS and ACM/SIGPLAN artifact evaluation.
