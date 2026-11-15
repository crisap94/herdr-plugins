# EXP-002 · Pre-registration

Frozen: the OpenSpec change `autocompact` as merged to `main` in `83fa1c7` (2026-10-08, !50), design decision 9.
Everything below was written there before any run of this experiment.

| Field | Value |
|---|---|
| Status | **frozen** at `83fa1c7` |
| Parent | OpenSpec `autocompact` (`openspec/changes/autocompact/{proposal,design,tasks}.md` at that commit) |
| Question owner | the reviewer (main session); one coder built the tools and ran the arms |

## 1. Question

Which decider should autocompact use by default: the hosted typed-judgment model (Jev) or a coding-agent
harness on a plan the operator already pays for? And do the six questions separate safe moments from
unsafe ones at all?

- **Confirmed** for a question when its AUC against the labels is clearly above 0.5 in every arm, and its
  undecided rate is low.
- **Refuted** for a question when it sits near 0.5 or in the undecided band in most cases. By design
  decision 2 it is then retired, not reworded until it passes.

## 2. Corpus

- **Sampling frame:** every stored `turn-ended` run of a Claude lane, as one point (run, lane).
- **State:** built by the plugin's own code from the transcript up to the run's read cursor and the ledger at
  the run's time.
- **Sample:** 240 points, seed 42:
  - 120 with a share ≥ 40 %;
  - 60 that are the last turn end before an agent's own compaction;
  - 60 at random.
- **Brief corpus:** 30 points with regenerated briefs, giving about 750 fact/brief pairs.
- **Outcome set:** every compaction boundary in the last 30 days of Claude transcripts, with the files
  re-read after it and whether the operator restated something.

Raw items quote real sessions and never reach `main`.

## 3. Labels

- **Hindsight labeller:** a pinned strong model (Codex `gpt-6.1-sol`, effort `high`) reads the state plus
  what happened next and answers each question 0/1.
- **Deterministic cross-check of `needs_verbatim`:** did the next agent turns reuse a path, error line or
  hash found only in the last turns?
- **Operator:** 60 points. A question's labels are trusted where kappa against the operator is ≥ 0.6.

## 4. Arms

| Arm | Decider |
|---|---|
| `jev` | Jev `jev-1.13.0` over HTTP |
| `haiku-low` | Claude harness, `claude-haiku-5-5`, effort low |
| `haiku-medium` | Claude harness, `claude-haiku-5-5`, effort medium |
| `luna-low` | Codex harness, `gpt-6-luna`, effort low |

Same state documents, same question texts. Each arm runs twice.

## 5. Metrics

- **Per question:**
  - AUC against the labels;
  - Brier score;
  - undecided rate (0.35–0.65);
  - drift between the two runs;
  - tokens, money and wall time.
- **Per policy:**
  - precision of `compact` (compacting at an unsafe moment is the costly error);
  - recall above the soft limit;
  - on the outcome subset, re-reads and restating for the boundaries the arm would allow vs block.
- **Coverage:** AUC of `brief_keeps_fact` and `brief_keeps_reason`.

## 6. Decision rule

- **Default decider:** the arm that needs nothing beyond the recap writer's harness, if its policy precision
  is within 3 points of the best arm and its drift is ≤ 0.15. Another arm becomes the default only if it
  beats that.
- **Coverage decider:** the arm with the best `brief_keeps_*` AUC.
