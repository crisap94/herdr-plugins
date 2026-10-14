# Tasks

Paths are under `tab-recap/` unless named. Design: `design.md` (the architect's proposal). Every group ends with `bash ci/lint.sh` and
`bash ci/test.sh` passing in a pod gate, never on CT 103, and with `evidence/measure.sh` rerun on the same panes; the numbers go in the MR.

## 0. Baseline

- [x] 0.1 Baseline with three tools over 60 s: /proc ticks including git children, the LXC cgroup `cpu.stat`, 1 s sampling of running
      `git status`, and RSS. Done: `evidence/baseline-20261014T1108.txt`.

## Constraints that keep the proof valid (design §5)

- The column entry stays `src/column/launch.mjs` and the daemon `src/daemon/launch.mjs` (MR 3 swaps what the column imports, not its
  path); every status call keeps the prefix `git -c core.fsmonitor=false status`. A rename would make `measure.sh` silently score 0.
- Targets on `measure.sh` (median of three 60 s runs at comparable load, same 142 panes as the baseline): tab-recap CPU ≤ 12 CPU-s per 60 s
  (baseline 119.9), RSS ≤ 2 GiB (6,648 MiB), ≤ 15 `git status` samples (223). Summaries are judged from `daemon.log` over 24 h before and after.

## 1. Budgets that cost nothing (MR 1)

- [ ] 1.2 `TAB_RECAP_RUN_DEBOUNCE_MS` defaults to 120 000; at most two summaries run at once; none runs when there is no new text; the
      log line carries the tokens. Waits for design Q3.

## 2. Worktree status in the daemon, from events (MR 2)

- [ ] 2.1 `WorktreeStatus` registry and port; a git-dir watcher adapter; the two-tier status (cheap tracked status on change,
      untracked count at turn end and every 2 minutes, design Q4); tokens from `pane.updated`; the bridge-log tail.
- [ ] 2.2 The perf counters of group 4 land here, so 2 and 3 can show their numbers.

## 3. Daemon-rendered columns (MR 3)

- [ ] 3.1 `ColumnFrames` port and socket adapter; the column becomes `src/column/terminal.mjs` (plain JS, host policy kept); the manifest's
      column points at it; `present()` runs in the daemon; one repaint per minute for relative times.

## 4. Proof

- [ ] 4.1 `bin/tab-recap.mjs status --perf`, `ci/perf-bench.sh` and its CI job; the daemon heap investigation.
- [ ] 4.2 After each of MR 1, 2 and 3: `evidence/measure.sh <outdir> 60` three times on the same panes, median against the baseline, to
      attribute the gain; the targets are in the constraints above.
- [ ] 4.3 Open the herdr upstream issue: plugin panes are restored as shells (design Q5).

## 5. Restored columns, last and off by default (MR 5)

- [ ] 5.0 The `retire-restored-column` intent under the five-part identity (label `Recap`, cwd = plugin root, no agent, title not
      `tab-recap`, only an idle login shell), checked in column-panes, the fold and `HerdrFleet.close`; off by default, shipped only after
      the after-measurement (4.2). Waits for the operator's ruling on the fifth red line (design Q2).

## 6. Archive

- [ ] 6.1 Archive the change after groups 1–5.
