# EXP-003 · How long does each harness need before it accepts a typed handoff, and does the handoff survive a live agent?

| Field | Value |
|---|---|
| Status | concluded (measurement) |
| Decision | adopt the measured settle times (Claude 10 000 ms, Codex 3 000 ms, OpenCode 60 000 ms on this host) and derive the handoff bounds from the 60 s ceiling; two questions stay open (an unsubmitted long paste, a fresh Claude lane's session id before its first prompt) |
| Owner | tab-recap maintainers |
| Dates | 2026-10-11 → 2026-10-11 |
| Parent | OpenSpec change `lane-handoff`, task group 8 (real-herdr proof) |
| Links | the code commit `108d8cb` on `feat/lane-handoff`; the merge request that lands this record |

## Question and hypothesis

When a handoff is typed into an agent that has just started, how long must the plugin wait before the agent accepts the text? A settle time that is too short loses the prompt silently; the registry must hold a value that the measurements support.

- **H1 (Claude):** prompts typed at least 10 s after the start returns are received; a shorter wait loses some of them. Refuted in part: about 6 % of prompts at 10 s or more were still lost on this host, so confirmation has to catch a loss.
- **H2 (Codex):** the start is ready in under 4 s. Confirmed for 0 to 12 s: no prompt was lost.
- **H3 (OpenCode):** the start is ready in under 10 s. Refuted: nothing was received up to 30 s; prompts at 60 s and later were all received.

## Method

- **Corpus:** no corpus. A trial is one fresh throwaway agent of one kind in a scratch repository, started, held for a nominal delay of 0 to 12 s (OpenCode also 15 to 120 s), then sent one prompt with a unique marker. Claude 130 trials, Codex 130, OpenCode 77.
- **Candidates:** the three registered kinds that declare a handoff plan. Hermes declares none and is out of scope.
- **Metrics:** primary, the received fraction per nominal delay (marker present in the agent's own transcript store within 25 s). Secondary, the actual delay from start to prompt, the time to received, and the start status. Guardrail: the host load at each trial.
- **Environment:** a separate herdr session, a scratch state directory, and a plugin daemon built from the worktree. Eight cores, load 60 to 190, four trials in parallel.
- **Decision rule (fixed before the data was read):** settle = the smallest nominal delay from which every larger delay was fully received, plus a margin chosen by the maintainer.

## Runs

| Run | Status | What changed | Outcome |
|---|---|---|---|
| [R01-settle-and-handoff-proof](runs/R01-settle-and-handoff-proof/run.yaml) | valid | first live proof on `108d8cb`: idle delivery, refusal of a working target, print, refresh, a 16 KiB handoff, transcript location, and the settle sweep (337 trials) | the settle values below; the proof checks listed under Results |

## Results

Received by nominal delay, `received/n` (from [`m4-trials.jsonl`](runs/R01-settle-and-handoff-proof/m4-trials.jsonl)):

| Kind | Delay in seconds → received/n |
|---|---|
| Claude | 0:3/10 · 1:5/10 · 2:5/10 · 3:6/10 · 4:5/10 · 5:8/10 · 6:8/10 · 7:10/10 · 8:10/10 · 9:10/10 · 10:9/10 · 11:9/10 · 12:10/10 |
| Codex | 0 to 12: 10/10 at every delay (130/130) |
| OpenCode | 0 to 30: 0/65 · 45: 1/3 · 60: 3/3 · 90: 3/3 · 120: 3/3 |

Proof checks (group 8, bullet 1):

| Check | Result |
|---|---|
| Idle target receives the handoff once | pass: 9 deliveries across Claude, Codex and OpenCode; 14 to 22 s end to end without refresh |
| Working target refused, no text, no refresh | pass: refused in 2 to 4 s; zero prompts typed; with and without `--refresh` |
| `--print` types nothing | pass: zero requests, zero prompts, transcript unchanged |
| `--refresh` yields a current ledger first | pass: a stale ledger became current in 17.6 s with cause `requested` |
| 16 KiB handoff arrives intact as one prompt per kind | pass: Codex byte-identical (sha-256 match); Claude 58 bytes longer from the wrapper; OpenCode one trailing space |
| A long paste left unsubmitted ends `failed{unconfirmed}` | **not reproduced**: the test method made the terminal hand the pty to the shell |
| Shared-directory risk (Codex, OpenCode) | confirmed: the locator picks the newest transcript in the directory, so a fresh lane can attach to another lane's transcript |
| Unknown-session risk (Codex, OpenCode) | Codex `agent_session` was null in every case; OpenCode's appeared only after the first prompt; deliveries still confirmed by status evidence |
| Fresh Claude lane knows its session before its first prompt | **does not hold on its own**: the id was in the start result in 4 of 11 starts; otherwise it appeared 1.1 to 5.2 s later |

## Anomalies and threats to validity

- **Transcript confirmation could never match Claude** (fixed in this change): Claude Code wraps a multi-line prompt in `<pasted_content>` tags in its transcript, so the 400-code-point prefix never matched the raw text. Every Claude delivery in R01 was confirmed by status evidence only.
- **Silent loss in the first seconds:** Claude dropped about half of the prompts typed within 4 s and a few percent up to 17 s; OpenCode dropped every prompt up to 30 s with no error from `agent prompt`. Both losses are silent, which is why confirmation and the no-retry rule matter.
- **Settle figures are upper-ish:** the host ran at load 60 to 190, so a quieter host may need less.
- **Trial counts corrected:** the first draft of the summary said OpenCode had 3 trials at 20 s and 30 s; the raw file has 4 at each. The summary here is corrected; the totals are Claude 130, Codex 130, OpenCode 77 (337).
- **Codex margin is not measured:** the start returned with status `unknown` in 127 of 130 starts, so the unknown-to-idle time was never measured; the 3 000 ms value is a margin on the 0-loss result.
- **Branch moved during the run** (5d69365 to 108d8cb); the first measurements ran on the live worktree and the clean checks on an archive of 108d8cb.
- **Left behind on the host:** the throwaway agents wrote 105 Claude transcripts, 133 Codex rollouts and 13 OpenCode sessions under their own home directories, all with a scratch working directory. They were not deleted.
- **Hermes** was refused `not-a-lane` under the default watched kinds, so `no-plan` is not reachable with the defaults.

## Interpretation and decision

- **Claude 10 000 ms** stays. It is the largest value the data supports without a readiness probe; the residual loss is caught by confirmation, so it is never silent to the operator.
- **Codex 3 000 ms** is the smallest value with a margin over the 0-loss result.
- **OpenCode 60 000 ms** is measured on this host only; it sets the handoff ceiling. The plan's settle is the largest in the registry, so the flow bounds follow from it: the settle ceiling is 60 s, the take bound 30 s, the flow 170 s, the deadline 200 s, the wait without refresh 110 s.
- **Not decided:** whether a readiness probe can replace the clock for OpenCode; whether the long unsubmitted paste ends `failed{unconfirmed}` in a live agent.

## Next steps

- Re-measure OpenCode's readiness on a quieter host, or replace the fixed settle with a readiness probe.
- Reproduce the unsubmitted-paste case inside a live agent without stopping its process.
- Measure Codex's unknown-to-idle time, so the 3 000 ms margin rests on a figure.
- Measure Claude's loss from transcript evidence: since the prompt unwrapping fix, a Claude delivery can be confirmed in its own transcript, so the loss rate no longer rests on status evidence alone.

## Reproducibility checklist

- [x] Code commit recorded for every run (`108d8cb`)
- [ ] Corpus versioned and hashed (no corpus; the trial rows are the data)
- [ ] Container images pinned by digest or checksum (not used; versions in `manifest.yaml`)
- [x] Exact commands in every `run.yaml`
- [x] Resource limits and host recorded
- [x] Raw outputs kept, not only summaries (`m4-trials.jsonl`, one row per trial)
- [x] Invalid runs kept and explained (none invalid; the first draft counts are corrected in `summary.md`)
- [x] Known limitations stated
