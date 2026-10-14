# Tasks

Paths are under `tab-recap/` unless named. Design: `design.md` (the architect's proposal). Every group ends with `bash ci/lint.sh` and
`bash ci/test.sh` passing in a pod gate, never on CT 103, and with `evidence/measure.sh` rerun on the same panes; the numbers go in the MR.

## 0. Baseline

- [x] 0.1 Baseline with three tools over 60 s: /proc ticks including git children, the LXC cgroup `cpu.stat`, 1 s sampling of running
      `git status`, and RSS. Done: `evidence/baseline-20261014T1108.txt`.

## 1. Restored columns and budgets that cost nothing (MR 1)

- [ ] 1.1 The `retire-restored-column` intent: a pane is a restored column only when label `Recap`, cwd = plugin root, no agent, title not
      `tab-recap`, and `pane.process_info` shows only an idle login shell; checked in column-panes, the fold and `HerdrFleet.close`.
      Waits for the operator's ruling on the fifth red line (design Q2).
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
- [ ] 4.2 After each MR: `evidence/measure.sh` on the same panes as the baseline; targets about 15 `git status` per minute (from about
      336), column RSS about 1.1 GiB (from 5.8 GiB), column CPU under 5 %.
- [ ] 4.3 Open the herdr upstream issue: plugin panes are restored as shells (design Q5).

## 5. Archive

- [ ] 5.1 Archive the change after groups 1–4.
